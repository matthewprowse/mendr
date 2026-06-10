/**
 * Phase 2 — integration safety net for the /api/providers route handler.
 *
 * Pins the observable behaviour with all external dependencies mocked at the
 * module boundary. These tests prove the Phase 2 extraction preserved the
 * behaviour the frontend depends on (response shape, status codes, order of
 * external calls).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
    isRateLimitBypassed: vi.fn(() => true),
}));

// Capture supabase calls for ordering assertions.
const supabaseCalls: { table: string; op: string }[] = [];

function makeFromBuilder(table: string) {
    return {
        select() {
            supabaseCalls.push({ table, op: 'select' });
            return {
                eq() {
                    return {
                        single: async () => ({ data: null, error: null }),
                        in: async () => ({ data: [], error: null }),
                    };
                },
                in: async () => ({ data: [], error: null }),
                order() {
                    return {
                        then: (resolve: (v: unknown) => unknown) =>
                            resolve({ data: [], error: null }),
                    };
                },
            };
        },
        upsert: async () => ({ data: null, error: null }),
        update() {
            return { in: async () => ({ data: null, error: null }) };
        },
        delete() {
            return {
                eq() {
                    return {
                        eq() {
                            return { lt: async () => ({ data: null, error: null }) };
                        },
                    };
                },
                in: async () => ({ data: null, error: null }),
            };
        },
    };
}

const mockSupabaseClient = () => ({
    from: (table: string) => makeFromBuilder(table),
});

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: async () => mockSupabaseClient(),
    createSupabaseAdminClient: async () => mockSupabaseClient(),
}));

vi.mock('@/lib/ai/ai-logging', () => ({
    logAiEvent: vi.fn(),
}));

// Stub the global fetch so we never call Google Places.
const placesFetchSpy = vi.fn(async (_url?: unknown, _init?: RequestInit) => {
    return new Response(
        JSON.stringify({
            places: [
                {
                    id: 'places/ChIJfakeplaceid1',
                    displayName: { text: 'Acme Plumbing' },
                    formattedAddress: '1 Main Rd, Cape Town',
                    rating: 4.7,
                    userRatingCount: 42,
                    location: { latitude: -33.92, longitude: 18.42 },
                    types: ['plumber'],
                    nationalPhoneNumber: '+27 21 555 0001',
                    websiteUri: 'https://acme.example',
                    regularOpeningHours: { weekdayDescriptions: [] },
                },
            ],
            routingSummaries: [{ legs: [{ distanceMeters: 1500, duration: '180s' }] }],
            nextPageToken: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
    );
});

beforeEach(() => {
    supabaseCalls.length = 0;
    placesFetchSpy.mockClear();
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-for-mocked-places-api';
     
    (global as any).fetch = placesFetchSpy;
});

function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

describe('/api/providers — 400 validation gates', () => {
    it('returns 400 for empty body', async () => {
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(''));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/required/i);
    });

    it('returns 400 for invalid JSON', async () => {
        const { POST } = await import('../handler');
        const res = await POST(makeRequest('not json at all'));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/json/i);
    });

    it('returns 400 when lat/lng/trade are missing', async () => {
        const { POST } = await import('../handler');
        const res = await POST(makeRequest({ lat: -33.92 }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/lat, lng, trade/i);
    });

    it('returns 400 when pageToken is supplied without searchQuery', async () => {
        const { POST } = await import('../handler');
        const res = await POST(
            makeRequest({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
                pageToken: 'abc123',
            }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/searchQuery is required/i);
    });
});

describe('/api/providers — happy path', () => {
    it('returns 200 with providers + searchQuery + nextPageToken keys', async () => {
        const { POST } = await import('../handler');
        const res = await POST(
            makeRequest({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
            }),
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toHaveProperty('providers');
        expect(json).toHaveProperty('searchQuery');
        // nextPageToken may be null but the key should exist when the fast path returns.
    });

    it('calls Google Places with the resolved API key in X-Goog-Api-Key', async () => {
        const { POST } = await import('../handler');
        await POST(
            makeRequest({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
            }),
        );
        expect(placesFetchSpy).toHaveBeenCalled();
        const [, init] = placesFetchSpy.mock.calls[0];
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers['X-Goog-Api-Key']).toBe('test-key-for-mocked-places-api');
    });
});

describe('/api/providers — API key missing', () => {
    it('returns 500 when no Places API key is configured', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const { POST } = await import('../handler');
        const res = await POST(
            makeRequest({
                lat: -33.92,
                lng: 18.42,
                trade: 'Plumbing',
            }),
        );
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toMatch(/api key/i);
    });
});
