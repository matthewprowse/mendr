/**
 * Phase 2 — unit coverage for additional branches of the /api/providers route
 * handler (`handler.ts`).
 *
 * The existing `handler.integration.test.ts` pins the validation gates, happy
 * path, and missing-API-key case. This file exercises the conditional paths
 * that integration test does not reach:
 *   - rate-limit short-circuit
 *   - transient Google Places errors (429 → 429, 503 → 503)
 *   - empty Places result → `{ providers: [] }`
 *   - the search-cache fast hit path returning cached providers
 *
 * All external dependencies are mocked at the module boundary; no real network
 * or Supabase calls are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Rate-limit mock (overridable per-test) ──────────────────────────────────
const checkRateLimitMock = vi.fn(async () => null as NextResponse | null);
vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...(args as [])),
    isRateLimitBypassed: vi.fn(() => true),
}));

vi.mock('@/lib/ai/ai-logging', () => ({
    logAiEvent: vi.fn(),
}));

// ── Configurable Supabase mock ──────────────────────────────────────────────
// `searchCacheRow` lets a test inject a provider_search_cache hit.
let searchCacheRow: Record<string, unknown> | null = null;

// Per-table rows the .in() / nested queries should resolve with. Lets a test
// make the cache-hit "providers have Google reviews" branch return cleanly.
let providersRows: Record<string, unknown>[] = [];
let reviewsRows: Record<string, unknown>[] = [];

function makeFromBuilder(table: string) {
    const listFor = async () => {
        if (table === 'providers') return { data: providersRows, error: null };
        if (table === 'reviews') return { data: reviewsRows, error: null };
        return { data: [], error: null };
    };
    return {
        select() {
            return {
                eq() {
                    return {
                        single: async () => {
                            if (table === 'provider_search_cache') {
                                return { data: searchCacheRow, error: null };
                            }
                            return { data: null, error: null };
                        },
                        in: listFor,
                        eq() {
                            return { in: listFor, limit: listFor };
                        },
                        limit: listFor,
                    };
                },
                in: listFor,
                order() {
                    return {
                        then: (resolve: (v: unknown) => unknown) =>
                            resolve({ data: [], error: null }),
                    };
                },
            };
        },
        upsert: async () => ({ data: null, error: null }),
    };
}

const mockSupabaseClient = () => ({
    from: (table: string) => makeFromBuilder(table),
});

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: async () => mockSupabaseClient(),
    createSupabaseAdminClient: async () => mockSupabaseClient(),
}));

// ── Global fetch mock (Google Places) ───────────────────────────────────────
let placesResponder: () => Response = () =>
    new Response(JSON.stringify({ places: [], routingSummaries: [], nextPageToken: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });

const placesFetchSpy = vi.fn(async () => placesResponder());

beforeEach(() => {
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue(null);
    searchCacheRow = null;
    providersRows = [];
    reviewsRows = [];
    placesFetchSpy.mockClear();
    placesResponder = () =>
        new Response(
            JSON.stringify({ places: [], routingSummaries: [], nextPageToken: null }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        );
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-for-mocked-places-api';
    (global as unknown as { fetch: unknown }).fetch = placesFetchSpy;
});

function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

const validBody = { lat: -33.92, lng: 18.42, trade: 'Plumbing' };

describe('/api/providers — rate limiting', () => {
    it('short-circuits and returns the rate-limit response without calling Places', async () => {
        checkRateLimitMock.mockResolvedValue(
            NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
        );
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(429);
        expect(placesFetchSpy).not.toHaveBeenCalled();
    });
});

describe('/api/providers — transient Places errors', () => {
    it('returns 429 with PLACES_UNAVAILABLE when Google rate-limits', async () => {
        placesResponder = () => new Response('rate limited', { status: 429 });
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(429);
        const json = await res.json();
        expect(json.code).toBe('PLACES_UNAVAILABLE');
        expect(json.providers).toEqual([]);
        expect(json.error).toMatch(/rate-limit/i);
    });

    it('returns 503 with PLACES_UNAVAILABLE when Google is temporarily unavailable', async () => {
        placesResponder = () => new Response('unavailable', { status: 503 });
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(503);
        const json = await res.json();
        expect(json.code).toBe('PLACES_UNAVAILABLE');
        expect(json.error).toMatch(/temporarily unavailable/i);
    });
});

describe('/api/providers — empty results', () => {
    it('returns { providers: [] } when Places returns no places', async () => {
        placesResponder = () =>
            new Response(
                JSON.stringify({ places: [], routingSummaries: [], nextPageToken: null }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            );
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.providers).toEqual([]);
    });
});

describe('/api/providers — search-cache fast hit', () => {
    it('returns cached providers without calling Google Places', async () => {
        // A fresh cache row with rich providers JSON that passes the
        // min-review + in-radius filters used by the fast-hit branch.
        searchCacheRow = {
            place_ids: ['places/ChIJcachedplace1'],
            routing_summaries: [{}],
            next_page_token: null,
            created_at: new Date().toISOString(),
            providers: [
                {
                    name: 'Cached Plumbing Co',
                    placeId: 'places/ChIJcachedplace1',
                    address: '5 Cache St, Cape Town',
                    rating: 4.8,
                    ratingCount: 30,
                    latitude: -33.921,
                    longitude: 18.421,
                    summary: 'Reliable cached plumber.',
                    weekdayDescriptions: [],
                },
            ],
        };
        // Matching providers row + an existing Google review so the handler
        // takes the clean cached-return path (no forced Google refetch).
        providersRows = [
            { id: 'prov-1', google_place_id: 'places/ChIJcachedplace1', name: 'Cached Plumbing Co' },
        ];
        reviewsRows = [{ id: 'rev-1' }];
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(Array.isArray(json.providers)).toBe(true);
        expect(json.providers.length).toBeGreaterThan(0);
        expect(json.providers[0].name).toBe('Cached Plumbing Co');
        // Fast cache hit must not hit Google Places.
        expect(placesFetchSpy).not.toHaveBeenCalled();
    });

    it('returns empty providers when cached rows fail the min-review filter', async () => {
        searchCacheRow = {
            place_ids: ['places/ChIJcachedplace2'],
            routing_summaries: [{}],
            next_page_token: null,
            created_at: new Date().toISOString(),
            providers: [
                {
                    name: 'Low Review Plumber',
                    placeId: 'places/ChIJcachedplace2',
                    rating: 4.0,
                    ratingCount: 2, // below the >= 5 threshold
                    latitude: -33.921,
                    longitude: 18.421,
                    summary: 'x',
                    weekdayDescriptions: [],
                },
            ],
        };
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.providers).toEqual([]);
        expect(placesFetchSpy).not.toHaveBeenCalled();
    });

    it('falls through to Google Places when the cache row is stale', async () => {
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
        searchCacheRow = {
            place_ids: ['places/ChIJstaleplace'],
            routing_summaries: [{}],
            next_page_token: null,
            created_at: eightDaysAgo,
            providers: [
                {
                    name: 'Stale Plumber',
                    placeId: 'places/ChIJstaleplace',
                    rating: 4.5,
                    ratingCount: 20,
                    latitude: -33.921,
                    longitude: 18.421,
                    summary: 'stale',
                    weekdayDescriptions: [],
                },
            ],
        };
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        // Stale cache → Google Places is called for fresh data.
        expect(placesFetchSpy).toHaveBeenCalled();
    });
});

describe('/api/providers — unexpected errors', () => {
    it('returns 500 when an unexpected error is thrown downstream', async () => {
        // Force a throw from the Places fetch path (non-transient status throws).
        placesResponder = () => new Response('boom', { status: 418 });
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBeTruthy();
    });
});
