import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/providers/persistence', () => ({
    expandPlaceIdsForDbQuery: (ids: string[]) => ids,
    toGooglePlaceId: (id: string) => id,
}));
vi.mock('@/lib/ai/ai-config', () => ({ aiConfig: { providerEnrichmentCacheVersion: 1 } }));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            providers: { data: [], error: null },
            provider_cache: { data: [], error: null },
        },
    });
});

describe('POST /api/enrich/get', () => {
    it('returns { cache: {} } when no placeIds supplied', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.cache).toEqual({});
    });

    it('returns { cache: {} } on invalid body (silently)', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: 'not json' }),
        );
        expect(res.status).toBe(200);
    });

    it('returns { cache: {} } when no rows found', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { placeIds: ['places/abc'] } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.cache).toEqual({});
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
