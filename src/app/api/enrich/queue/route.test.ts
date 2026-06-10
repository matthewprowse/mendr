import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/providers/provider-enrichment', () => ({
    enrichProvider: vi.fn(async () => ({ ok: true })),
    enrichProviderReviewSummaryFast: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/providers/persistence', () => ({
    expandPlaceIdsForDbQuery: (ids: string[]) => ids,
    toGooglePlaceId: (id: string) => id,
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: { providers: { data: [], error: null } },
    });
});

describe('POST /api/enrich/queue', () => {
    it('returns 400 when neither placeIds nor providerIds supplied', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns { queued: 0 } when no matching providers found', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { placeIds: ['places/x'] } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.queued).toBe(0);
    });

    it('returns counts when providers found and runs fast jobs by default', async () => {
        supabase = mockSupabaseClient({
            tables: {
                providers: { data: [{ id: 'p1', google_place_id: 'places/x' }], error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { placeIds: ['places/x'] } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.queued).toBe(1);
        expect(body.processed).toBe(1);

        const enrich = await import('@/lib/providers/provider-enrichment');
        expect(enrich.enrichProviderReviewSummaryFast).toHaveBeenCalled();
    });

    it('runs full enrichment when mode=full', async () => {
        supabase = mockSupabaseClient({
            tables: {
                providers: { data: [{ id: 'p1', google_place_id: 'places/x' }], error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { placeIds: ['places/x'], mode: 'full' } }),
        );
        expect(res.status).toBe(200);
        const enrich = await import('@/lib/providers/provider-enrichment');
        expect(enrich.enrichProvider).toHaveBeenCalled();
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { placeIds: ['x'] } }));
        expect(res.status).toBe(429);
    });
});
