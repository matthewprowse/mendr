/**
 * Unit tests for the Places HTTP client wrapper extracted from `handler.ts`
 * in Phase 2.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    buildMockPlacesSearchTextResponse,
    fetchPlacesSearchText,
    isTransientPlacesHttpStatus,
    resolvePlacesApiKey,
    PLACES_SEARCH_TEXT_URL,
    PLACES_SEARCH_TEXT_FIELD_MASK,
} from '../handler-places-client';

describe('isTransientPlacesHttpStatus', () => {
    it.each([
        [503, true],
        [502, true],
        [429, true],
        [500, false],
        [404, false],
        [200, false],
    ])('classifies %i as transient=%s', (status, expected) => {
        expect(isTransientPlacesHttpStatus(status)).toBe(expected);
    });
});

describe('resolvePlacesApiKey', () => {
    const originalEnv = {
        GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
        NEXT_PUBLIC_GOOGLE_PLACES_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY,
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    };

    afterEach(() => {
        for (const k of Object.keys(originalEnv) as (keyof typeof originalEnv)[]) {
            if (originalEnv[k] === undefined) delete process.env[k];
            else process.env[k] = originalEnv[k];
        }
    });

    it('prefers the server-only GOOGLE_PLACES_API_KEY', () => {
        process.env.GOOGLE_PLACES_API_KEY = 'server';
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY = 'public';
        const { apiKey, source } = resolvePlacesApiKey();
        expect(apiKey).toBe('server');
        expect(source).toBe('GOOGLE_PLACES_API_KEY');
    });

    it('falls back to NEXT_PUBLIC_GOOGLE_PLACES_API_KEY when server key missing', () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY = 'public';
        const { apiKey, source } = resolvePlacesApiKey();
        expect(apiKey).toBe('public');
        expect(source).toBe('NEXT_PUBLIC_GOOGLE_PLACES_API_KEY');
    });

    it('falls back to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY when both above missing', () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'maps';
        const { apiKey, source } = resolvePlacesApiKey();
        expect(apiKey).toBe('maps');
        expect(source).toBe('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
    });

    it('returns null and source "none" when no key configured', () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const { apiKey, source } = resolvePlacesApiKey();
        expect(apiKey).toBeNull();
        expect(source).toBe('none');
    });
});

describe('fetchPlacesSearchText', () => {
    it('sends the API key in the X-Goog-Api-Key header', async () => {
        const fetchImpl = vi.fn(
            async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }),
        );
        await fetchPlacesSearchText(
            'test-key',
            { textQuery: 'plumber' },
            fetchImpl as unknown as typeof fetch,
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(PLACES_SEARCH_TEXT_URL);
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers['X-Goog-Api-Key']).toBe('test-key');
        expect(headers['X-Goog-FieldMask']).toBe(PLACES_SEARCH_TEXT_FIELD_MASK);
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('serialises the body as JSON', async () => {
        const fetchImpl = vi.fn(
            async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }),
        );
        await fetchPlacesSearchText(
            'test-key',
            { textQuery: 'plumber', pageSize: 20 },
            fetchImpl as unknown as typeof fetch,
        );
        const [, init] = fetchImpl.mock.calls[0];
        expect((init as RequestInit).body).toBe(
            JSON.stringify({ textQuery: 'plumber', pageSize: 20 }),
        );
    });

    it('retries once on 503', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
            .mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await fetchPlacesSearchText(
            'k',
            { textQuery: 'x' },
            fetchImpl as unknown as typeof fetch,
        );
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(res.status).toBe(200);
    });

    it('does NOT retry on non-503 statuses', async () => {
        const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
        const res = await fetchPlacesSearchText(
            'k',
            { textQuery: 'x' },
            fetchImpl as unknown as typeof fetch,
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(403);
    });

    describe('MOCK_PLACES branch', () => {
        const original = process.env.MOCK_PLACES;
        afterEach(() => {
            if (original === undefined) delete process.env.MOCK_PLACES;
            else process.env.MOCK_PLACES = original;
        });

        it('returns the canned response without invoking fetch', async () => {
            process.env.MOCK_PLACES = '1';
            const fetchImpl = vi.fn();
            const res = await fetchPlacesSearchText(
                'k',
                { textQuery: 'plumber' },
                fetchImpl as unknown as typeof fetch,
            );
            expect(fetchImpl).not.toHaveBeenCalled();
            expect(res.status).toBe(200);
            const body = (await res.json()) as { places: unknown[] };
            expect(Array.isArray(body.places)).toBe(true);
            expect(body.places).toHaveLength(3);
        });

        it('does NOT short-circuit when MOCK_PLACES is unset', async () => {
            delete process.env.MOCK_PLACES;
            const fetchImpl = vi.fn(
                async (_url: string, _init?: RequestInit) =>
                    new Response('{}', { status: 200 }),
            );
            await fetchPlacesSearchText(
                'k',
                { textQuery: 'plumber' },
                fetchImpl as unknown as typeof fetch,
            );
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        });
    });
});

describe('buildMockPlacesSearchTextResponse', () => {
    it('returns 3 Cape Town plumbers with the expected fields', () => {
        const payload = buildMockPlacesSearchTextResponse();
        const places = (payload as { places: Array<Record<string, unknown>> }).places;
        expect(places).toHaveLength(3);
        for (const p of places) {
            expect(typeof p.id).toBe('string');
            expect((p.id as string).startsWith('mock_plumber_capetown_')).toBe(true);
            expect((p.displayName as { text: string }).text).toBeTruthy();
            expect(typeof p.rating).toBe('number');
            expect(typeof p.userRatingCount).toBe('number');
            const loc = p.location as { latitude: number; longitude: number };
            expect(loc.latitude).toBeGreaterThan(-34.5);
            expect(loc.latitude).toBeLessThan(-33);
            expect(loc.longitude).toBeGreaterThan(18);
            expect(loc.longitude).toBeLessThan(19);
            expect(Array.isArray(p.types)).toBe(true);
            expect((p.types as string[]).includes('plumber')).toBe(true);
        }
    });

    it('is stable across calls (deterministic fixture)', () => {
        const a = JSON.stringify(buildMockPlacesSearchTextResponse());
        const b = JSON.stringify(buildMockPlacesSearchTextResponse());
        expect(a).toBe(b);
    });
});
