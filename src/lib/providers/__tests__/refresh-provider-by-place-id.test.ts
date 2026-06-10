import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;
let adminThrows = false;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => {
        if (adminThrows) throw new Error('admin down');
        return adminClient;
    }),
}));

vi.mock('@/lib/providers/review-normalization', () => ({
    normalizeReviewForDisplay: vi.fn(async (input: { originalBody: string; originalName: string | null }) => ({
        body: input.originalBody,
        reviewerName: input.originalName,
    })),
}));

vi.mock('@/lib/providers/review-summary', () => ({
    summarizeReviews: vi.fn(async () => ({ summary: 'Reliable and tidy.', meta: { kind: 'reviews', pos: 1, neg: 0, neu: 0 } })),
    sanitizeCustomerSummary: (s: string) => s,
}));

import { refreshProviderByPlaceId } from '../refresh-provider-by-place-id';

const googlePlace = (overrides: Record<string, unknown> = {}) => ({
    id: 'places/ChIJ1',
    displayName: { text: 'Acme Plumbing' },
    formattedAddress: '1 Main Rd',
    rating: 4.5,
    userRatingCount: 12,
    nationalPhoneNumber: '021 555 0000',
    websiteUri: 'https://acme.example',
    location: { latitude: -33.9, longitude: 18.4 },
    reviews: [],
    photos: [],
    ...overrides,
});

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminThrows = false;
    process.env.GOOGLE_PLACES_API_KEY = 'gkey';
    adminClient = mockSupabaseClient({
        tables: {
            providers: { data: { id: 'prov-1', google_place_id: 'places/ChIJ1' }, error: null },
            reviews: { data: [], error: null },
        },
    });
});

afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
});

describe('refreshProviderByPlaceId', () => {
    it('rejects an empty place id', async () => {
        expect(await refreshProviderByPlaceId('')).toEqual({
            ok: false,
            error: 'place_id is required',
        });
    });

    it('fails when the Google API key is not configured', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        expect(await refreshProviderByPlaceId('ChIJ1')).toEqual({
            ok: false,
            error: 'Google Places API key is not configured',
        });
    });

    it('fails when Google Places returns a non-200', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
        expect(await refreshProviderByPlaceId('ChIJ1')).toEqual({
            ok: false,
            error: 'Failed to fetch provider from Google Places',
        });
    });

    it('returns Database not available when the admin client throws', async () => {
        adminThrows = true;
        vi.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(googlePlace()), { status: 200 })
        );
        expect(await refreshProviderByPlaceId('ChIJ1')).toEqual({
            ok: false,
            error: 'Database not available',
        });
    });

    it('fails when the provider upsert returns no data', async () => {
        adminClient = mockSupabaseClient({
            tables: { providers: { data: null, error: { message: 'conflict' } } },
        });
        vi.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(googlePlace()), { status: 200 })
        );
        expect(await refreshProviderByPlaceId('ChIJ1')).toEqual({
            ok: false,
            error: 'Failed to save provider to database',
        });
    });

    it('upserts the provider and returns the provider id on success', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { id: 'prov-1', google_place_id: 'places/ChIJ1' }, error: null },
                reviews: { data: [], error: null },
            },
        });
        vi.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(googlePlace()), { status: 200 })
        );
        const result = await refreshProviderByPlaceId('ChIJ1');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.providerId).toBe('prov-1');
        expect(result.provider).toBeTruthy();
    });

    it('strips a places/ prefix from the raw place id when building the URL', async () => {
        const fetchSpy = vi
            .spyOn(global, 'fetch')
            .mockResolvedValue(new Response(JSON.stringify(googlePlace()), { status: 200 }));
        await refreshProviderByPlaceId('places/ChIJ1');
        expect(String(fetchSpy.mock.calls[0][0])).toContain('/places/ChIJ1');
    });
});
