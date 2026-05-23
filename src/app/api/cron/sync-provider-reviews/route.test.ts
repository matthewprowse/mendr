import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/providers/dataforseo-client', () => ({
    fetchDataForSEOReviews: vi.fn(async () => ({ reviews: [], rawResponse: {} })),
}));
vi.mock('@/lib/providers/review-ingestion', () => ({
    ingestDataForSEOReviews: vi.fn(async () => ({ added: 0, unchanged: 0 })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.DATAFORSEO_LOGIN = 'login';
    process.env.DATAFORSEO_PASSWORD = 'pw';
    supabase = mockSupabaseClient({
        tables: { providers: { data: [], error: null } },
    });
});

describe('GET /api/cron/sync-provider-reviews', () => {
    it('returns 401 without cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/sync-provider-reviews' }));
        expect(res.status).toBe(401);
    });

    it('returns 200 with cron auth and no providers', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/sync-provider-reviews', cron: true }));
        expect(res.status).toBe(200);
    });

    it('respects ?limit query param', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/sync-provider-reviews?limit=10', cron: true }));
        expect(res.status).toBe(200);
    });

    it('respects dryRun', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cron/sync-provider-reviews?dryRun=true', cron: true }),
        );
        expect(res.status).toBe(200);
    });
});
