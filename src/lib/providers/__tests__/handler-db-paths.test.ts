/**
 * Coverage for the DB-augmentation branches of the /api/providers route handler
 * (`handler.ts`) that the existing handler tests do not reach:
 *
 *   - Supabase server client constructor throwing (cache disabled warning path)
 *   - Google Places path WITH matching DB rows: provider_cache + providers +
 *     provider_images gallery + certifications + specialisations prefetch, then
 *     the ranking / Mendr-review-count / soft-rotation token bucket path.
 *   - Cache-hit fast path attaching provider_images gallery to ranked results.
 *   - Backward-compat non-rich cache row → forced Google refresh.
 *   - `attachDebugTiming` development branch.
 *
 * Every external dependency is mocked at the module boundary; no real network
 * or Supabase calls are made. A flexible chainable query builder lets each test
 * inject per-table rows while still supporting the long `.eq().in().order()`
 * chains the handler issues.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const checkRateLimitMock = vi.fn(async () => null as NextResponse | null);
vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...(args as [])),
    isRateLimitBypassed: vi.fn(() => true),
}));

vi.mock('@/lib/ai/ai-logging', () => ({
    logAiEvent: vi.fn(),
}));

// ── Per-table row registry (reset each test) ────────────────────────────────
type Rows = Record<string, unknown>[];
let tableRows: Record<string, Rows> = {};
let searchCacheRow: Record<string, unknown> | null = null;
let serverClientThrows = false;

function rowsFor(table: string): Rows {
    if (table === 'provider_search_cache') {
        return searchCacheRow ? [searchCacheRow] : [];
    }
    return tableRows[table] ?? [];
}

/**
 * A thenable, chainable query builder. Every filter method (`eq`, `in`,
 * `order`, `limit`) returns the same builder, and the builder resolves to
 * `{ data, error }` when awaited or `.then()`-ed. `.single()` resolves to the
 * first row.
 */
function makeFromBuilder(table: string) {
    const result = { data: rowsFor(table), error: null };
    const builder: any = {
        select() {
            return builder;
        },
        eq() {
            return builder;
        },
        in() {
            return builder;
        },
        order() {
            return builder;
        },
        limit() {
            return builder;
        },
        single: async () => ({
            data: rowsFor(table)[0] ?? null,
            error: null,
        }),
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(result).then(onFulfilled, onRejected);
        },
        upsert: async () => ({ data: null, error: null }),
        update() {
            return builder;
        },
        delete() {
            return builder;
        },
    };
    return builder;
}

const mockSupabaseClient = () => ({
    from: (table: string) => makeFromBuilder(table),
});

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: async () => {
        if (serverClientThrows) throw new Error('supabase env not set');
        return mockSupabaseClient();
    },
    createSupabaseAdminClient: async () => mockSupabaseClient(),
}));

// ── Google Places fetch mock ────────────────────────────────────────────────
let placesResponder: () => Response = () =>
    new Response(
        JSON.stringify({ places: [], routingSummaries: [], nextPageToken: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
    );
const placesFetchSpy = vi.fn(async () => placesResponder());

const PLACE_ID = 'places/ChIJdbpath1';

function placesWithOneProvider() {
    return () =>
        new Response(
            JSON.stringify({
                places: [
                    {
                        id: PLACE_ID,
                        displayName: { text: 'DB Path Plumbing' },
                        formattedAddress: '7 DB Rd, Cape Town',
                        rating: 4.6,
                        userRatingCount: 50,
                        location: { latitude: -33.921, longitude: 18.421 },
                        types: ['plumber'],
                        nationalPhoneNumber: '+27 21 555 0100',
                        websiteUri: 'https://dbpath.example',
                        regularOpeningHours: { weekdayDescriptions: [] },
                    },
                ],
                routingSummaries: [{ legs: [{ distanceMeters: 1200, duration: '120s' }] }],
                nextPageToken: 'next-token-abc',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        );
}

beforeEach(() => {
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue(null);
    tableRows = {};
    searchCacheRow = null;
    serverClientThrows = false;
    placesFetchSpy.mockClear();
    placesResponder = () =>
        new Response(
            JSON.stringify({ places: [], routingSummaries: [], nextPageToken: null }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        );
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-for-mocked-places-api';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
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

describe('/api/providers — supabase server client failure', () => {
    it('still serves providers when createSupabaseServerClient throws', async () => {
        serverClientThrows = true;
        placesResponder = placesWithOneProvider();
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(Array.isArray(json.providers)).toBe(true);
        // Google Places must have been queried since the cache reader is admin-only.
        expect(placesFetchSpy).toHaveBeenCalled();
    });
});

describe('/api/providers — Google path with DB augmentation', () => {
    it('attaches providerId, certifications, specialisations, images, Mendr counts and applies rotation', async () => {
        placesResponder = placesWithOneProvider();
        // provider_cache row (profile completeness + specialisations)
        tableRows.provider_cache = [
            {
                google_place_id: PLACE_ID,
                profile_completeness: 2,
                specialisations: ['geyser', 'drainage'],
            },
        ];
        // providers row (id, name override, certifications)
        tableRows.providers = [
            {
                id: 'prov-db-1',
                google_place_id: PLACE_ID,
                name: 'DB Path Plumbing Pty Ltd',
                certifications: ['PIRB Registered', 'Gas Safe'],
                specialisations: ['geyser'],
            },
        ];
        // provider_images for gallery fallback
        tableRows.provider_images = [
            {
                provider_id: 'prov-db-1',
                bucket: 'gallery',
                path: 'prov-db-1/photo1.jpg',
                caption: 'Recent geyser install',
                sort_order: 1,
            },
            {
                provider_id: 'prov-db-1',
                bucket: 'gallery',
                path: '/prov-db-1/photo2.jpg',
                caption: null,
                sort_order: 2,
            },
        ];
        // mendr reviews (counted per provider)
        tableRows.reviews = [
            { provider_id: 'prov-db-1' },
            { provider_id: 'prov-db-1' },
        ];
        // rotation tokens (row with last_shown_at)
        tableRows.provider_rotation_tokens = [
            {
                provider_id: 'prov-db-1',
                tokens_remaining: 3,
                last_shown_at: '2026-06-01T10:00:00.000Z',
            },
        ];

        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.providers.length).toBeGreaterThan(0);
        const p = json.providers[0];
        expect(p.providerId).toBe('prov-db-1');
        // DB name override applied (formatted business name)
        expect(typeof p.name).toBe('string');
        expect(p.name.length).toBeGreaterThan(0);
        // Certifications mapped to { slug, label }
        expect(Array.isArray(p.certifications)).toBe(true);
        expect(p.certifications[0]).toHaveProperty('slug');
        expect(p.certifications[0]).toHaveProperty('label');
        // Specialisations attached from providers table (source of truth)
        expect(p.specialisations).toContain('geyser');
        // Gallery images attached, capped, with caption preserved where present
        expect(Array.isArray(p.images)).toBe(true);
        expect(p.images.length).toBe(2);
        expect(p.images[0].url).toContain(
            '/storage/v1/object/public/gallery/prov-db-1/photo1.jpg',
        );
        expect(p.hasWorkPhotos).toBe(true);
        // Mendr review count attached
        expect(p.mendrReviewCount).toBe(2);
        // lastMatchedAt from rotation tokens
        expect(p.lastMatchedAt).toBe('2026-06-01T10:00:00.000Z');
        expect(json.nextPageToken).toBe('next-token-abc');
    });

    it('skips DB augmentation in quickMode but still returns ranked providers', async () => {
        placesResponder = placesWithOneProvider();
        tableRows.provider_cache = [
            { google_place_id: PLACE_ID, profile_completeness: 1, specialisations: [] },
        ];
        tableRows.providers = [
            { id: 'prov-db-2', google_place_id: PLACE_ID, name: 'Quick Co', certifications: [] },
        ];
        const { POST } = await import('../handler');
        const res = await POST(makeRequest({ ...validBody, quickMode: true }));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.providers.length).toBeGreaterThan(0);
        // providerId still attached early (pre-quickMode block)
        expect(json.providers[0].providerId).toBe('prov-db-2');
    });
});

describe('/api/providers — cache-hit gallery attach', () => {
    it('attaches provider_images to cached/ranked providers on a fast cache hit', async () => {
        searchCacheRow = {
            place_ids: [PLACE_ID],
            routing_summaries: [{}],
            next_page_token: null,
            created_at: new Date().toISOString(),
            providers: [
                {
                    name: 'Cached Gallery Plumbing',
                    placeId: PLACE_ID,
                    address: '9 Cache Ave',
                    rating: 4.9,
                    ratingCount: 40,
                    latitude: -33.921,
                    longitude: 18.421,
                    summary: 'Cached with gallery.',
                    weekdayDescriptions: [],
                },
            ],
        };
        // providers row so the cache path resolves providerId and a Google review
        // exists (so it does NOT force a Google refetch).
        tableRows.providers = [
            { id: 'prov-gal-1', google_place_id: PLACE_ID, name: 'Cached Gallery Plumbing' },
        ];
        tableRows.reviews = [{ id: 'rev-existing' }];
        tableRows.provider_images = [
            {
                provider_id: 'prov-gal-1',
                bucket: 'gallery',
                path: 'prov-gal-1/img.jpg',
                caption: 'On-site work',
                sort_order: 1,
            },
        ];
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(placesFetchSpy).not.toHaveBeenCalled();
        expect(json.providers.length).toBeGreaterThan(0);
        const p = json.providers[0];
        expect(Array.isArray(p.images)).toBe(true);
        expect(p.images[0].url).toContain(
            '/storage/v1/object/public/gallery/prov-gal-1/img.jpg',
        );
        expect(p.hasWorkPhotos).toBe(true);
    });
});

describe('/api/providers — non-rich cache row falls back to Google', () => {
    it('treats a cache row without rich provider fields as expired', async () => {
        searchCacheRow = {
            place_ids: [PLACE_ID],
            routing_summaries: [{}],
            next_page_token: null,
            created_at: new Date().toISOString(),
            // providers JSON missing usable name → cacheHasRichFields is false
            providers: [{ placeId: PLACE_ID, name: '   ' }],
        };
        placesResponder = placesWithOneProvider();
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        // Non-rich cache → Google Places fetched for fresh data.
        expect(placesFetchSpy).toHaveBeenCalled();
    });
});

describe('/api/providers — debug timing in development', () => {
    beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'development');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('includes debugTiming in the response body when NODE_ENV=development', async () => {
        placesResponder = placesWithOneProvider();
        tableRows.providers = [
            { id: 'prov-dbg-1', google_place_id: PLACE_ID, name: 'Debug Co', certifications: [] },
        ];
        const { POST } = await import('../handler');
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.debugTiming).toBeTruthy();
        expect(json.debugTiming).toHaveProperty('totalMs');
        expect(json.debugTiming).toHaveProperty('stages');
        expect(json.debugTiming.searchCacheHit).toBe(false);
    });
});
