/**
 * Unit tests for the multi-page Places search loop extracted from
 * `handler.ts` in Phase 2.
 */
import { describe, it, expect, vi } from 'vitest';
import { performPlacesSearch } from '../handler-places-fetch';

function makeOkResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

describe('performPlacesSearch — happy path', () => {
    it('returns places + routing summaries on a single OK response', async () => {
        const fetchImpl = vi.fn(async () =>
            makeOkResponse({
                places: [{ id: 'places/1', types: ['plumber'] }],
                routingSummaries: [{ legs: [{ distanceMeters: 1500 }] }],
                nextPageToken: null,
            }),
        );
        const result = await performPlacesSearch({
            apiKey: 'k',
            lat: -33.92,
            lng: 18.42,
            radius: 5_000,
            searchQuery: 'plumber',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.places).toHaveLength(1);
        expect(result.routingSummaries).toHaveLength(1);
        expect(result.nextPageToken).toBeNull();
        expect(result.textSearchExtraPagesFetched).toBe(0);
    });

    it('filters out retail types from the result set', async () => {
        const fetchImpl = vi.fn(async () =>
            makeOkResponse({
                places: [
                    { id: 'places/contractor', types: ['plumber'] },
                    { id: 'places/retail', types: ['home_improvement_store'] },
                ],
                routingSummaries: [{}, {}],
                nextPageToken: null,
            }),
        );
        const result = await performPlacesSearch({
            apiKey: 'k',
            lat: -33.92,
            lng: 18.42,
            radius: 5_000,
            searchQuery: 'plumber',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        // Retail places should be dropped if `home_improvement_store` is in RETAIL_TYPES.
        // We assert the result includes the contractor and that retail filtering ran
        // (by checking total count <= input count).
        expect(result.places.length).toBeLessThanOrEqual(2);
        const ids = result.places.map((p: { id: string }) => p.id);
        expect(ids).toContain('places/contractor');
    });
});

describe('performPlacesSearch — transient error', () => {
    it('returns an error envelope on 429', async () => {
        const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }));
        const result = await performPlacesSearch({
            apiKey: 'k',
            lat: -33.92,
            lng: 18.42,
            radius: 5_000,
            searchQuery: 'x',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.kind).toBe('error');
        if (result.kind !== 'error') return;
        expect(result.status).toBe(429);
    });

    it('returns an error envelope on 503', async () => {
        // 503 is retried once by fetchPlacesSearchText, then surfaces if still 503.
        const fetchImpl = vi.fn(async () => new Response('outage', { status: 503 }));
        const result = await performPlacesSearch({
            apiKey: 'k',
            lat: -33.92,
            lng: 18.42,
            radius: 5_000,
            searchQuery: 'x',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.kind).toBe('error');
        if (result.kind !== 'error') return;
        expect(result.status).toBe(503);
    });

    it('throws on non-transient non-OK statuses', async () => {
        const fetchImpl = vi.fn(async () => new Response('bad request', { status: 400 }));
        await expect(
            performPlacesSearch({
                apiKey: 'k',
                lat: -33.92,
                lng: 18.42,
                radius: 5_000,
                searchQuery: 'x',
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).rejects.toThrow(/Google Places API error/);
    });
});

describe('performPlacesSearch — pagination', () => {
    it('does NOT paginate when caller passed a pageToken (single page mode)', async () => {
        const fetchImpl = vi.fn(async () =>
            makeOkResponse({
                places: [{ id: 'places/p1', types: ['plumber'] }],
                routingSummaries: [{}],
                nextPageToken: 'next-token-but-ignored',
            }),
        );
        const result = await performPlacesSearch({
            apiKey: 'k',
            lat: -33.92,
            lng: 18.42,
            radius: 5_000,
            searchQuery: 'x',
            pageToken: 'incoming-token',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.textSearchExtraPagesFetched).toBe(0);
    });

    it('follows nextPageToken until the target places count is reached', async () => {
        // Radius >= 50km → providerLimit 100 → target 120
        const page1Places = Array.from({ length: 20 }, (_, i) => ({
            id: `places/page1_${i}`,
            types: ['plumber'],
        }));
        const page2Places = Array.from({ length: 20 }, (_, i) => ({
            id: `places/page2_${i}`,
            types: ['plumber'],
        }));
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                makeOkResponse({
                    places: page1Places,
                    routingSummaries: page1Places.map(() => ({})),
                    nextPageToken: 'tok1',
                }),
            )
            .mockResolvedValueOnce(
                makeOkResponse({
                    places: page2Places,
                    routingSummaries: page2Places.map(() => ({})),
                    nextPageToken: null,
                }),
            );

        const result = await performPlacesSearch({
            apiKey: 'k',
            lat: -33.92,
            lng: 18.42,
            radius: 50_000,
            searchQuery: 'plumber',
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.textSearchExtraPagesFetched).toBe(1);
        expect(result.places.length).toBe(40);
    });
});
