import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
const originalFetch = global.fetch;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/providers/place-id', () => ({
    normalizePlaceId: (id: string) => id.replace(/^places\//, ''),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    supabase = mockSupabaseClient({
        tables: { onboarding_place_details_cache: { data: null, error: null } },
    });
    global.fetch = vi.fn(async () =>
        new Response(
            JSON.stringify({
                id: 'p1',
                displayName: { text: 'Acme' },
                formattedAddress: 'Cape Town',
                nationalPhoneNumber: '+27 21 555 1234',
                websiteUri: 'https://acme.test',
                location: { latitude: -33.9, longitude: 18.4 },
                types: ['plumber'],
                rating: 4.5,
                userRatingCount: 30,
            }),
            { status: 200 },
        ),
    ) as typeof global.fetch;
});

afterAll(() => {
    global.fetch = originalFetch;
});

describe('POST /api/providers/onboarding/place-details', () => {
    it('returns 400 on invalid JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when placeId missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns 500 when API key missing', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { placeId: 'p1' } }));
        expect(res.status).toBe(500);
    });

    it('returns place details on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { placeId: 'p1' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.details.businessName).toBe('Acme');
        expect(body.cached).toBe(false);
    });

    it('returns cached details when fresh row exists', async () => {
        supabase = mockSupabaseClient({
            tables: {
                onboarding_place_details_cache: {
                    data: {
                        payload: {
                            placeId: 'places/p1',
                            businessName: 'Cached',
                            address: '',
                            phone: null,
                            website: null,
                            lat: null,
                            lng: null,
                            types: [],
                            rating: null,
                            userRatingCount: null,
                        },
                        fetched_at: new Date().toISOString(),
                    },
                    error: null,
                },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { placeId: 'p1' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.cached).toBe(true);
    });
});
