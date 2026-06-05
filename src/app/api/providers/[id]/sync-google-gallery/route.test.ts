import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let imageCount = 0;
let providerData: { google_place_id?: string; claimed_by_user_id?: string } | null = {
    google_place_id: 'places/abc',
};

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/providers/refresh-provider-by-place-id', () => ({
    refreshProviderByPlaceId: vi.fn(async () => ({ ok: true })),
}));

function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    imageCount = 0;
    providerData = { google_place_id: 'places/abc' };
    supabase = mockSupabaseClient({
        tables: {
            provider_images: () => ({ data: [], error: null, count: imageCount }),
            providers: () => ({ data: providerData, error: null }),
        },
    });
});

describe('POST /api/providers/[id]/sync-google-gallery', () => {
    it('returns 400 when providerId missing (empty)', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', path: '/api/providers//sync-google-gallery' }), ctx(''));
        expect(res.status).toBe(400);
    });

    it('returns skipped when provider already has Google images', async () => {
        imageCount = 3;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }), ctx('p1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.skipped).toBe(true);
    });

    it('returns 400 when provider has no Google place id', async () => {
        providerData = {};
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }), ctx('p1'));
        expect(res.status).toBe(400);
    });

    it('returns ok when refresh succeeds', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }), ctx('p1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.synced).toBe(true);
    });

    it('returns 502 when refresh fails', async () => {
        const refresh = await import('@/lib/providers/refresh-provider-by-place-id');
        vi.mocked(refresh.refreshProviderByPlaceId).mockResolvedValueOnce({
            ok: false,
            error: 'no photos',
        } as never);
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }), ctx('p1'));
        expect(res.status).toBe(502);
    });

    it('forbids an unauthenticated sync of a claimed provider (H5)', async () => {
        providerData = { claimed_by_user_id: 'owner-1', google_place_id: 'places/abc' };
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }), ctx('p1'));
        expect(res.status).toBe(403);
    });
});
