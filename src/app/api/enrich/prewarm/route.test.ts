import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/providers/provider-enrichment', () => ({
    enrichProvider: vi.fn(async () => ({ ok: true, skipped: false })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    supabase = mockSupabaseClient({
        tables: {
            provider_cache: { data: [], error: null },
            providers: { data: [], error: null },
        },
    });
});

describe('GET /api/enrich/prewarm', () => {
    it('returns 401 without cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/enrich/prewarm' }));
        expect(res.status).toBe(401);
    });

    it('returns "all fresh" when no candidates', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/enrich/prewarm', cron: true }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.attempted).toBe(0);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_cache: { data: [], error: null },
                providers: { data: null, error: { message: 'db' } },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/enrich/prewarm', cron: true }));
        expect(res.status).toBe(500);
    });

    it('clamps maxTotal to 300', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/enrich/prewarm?maxTotal=9999', cron: true }),
        );
        expect(res.status).toBe(200);
    });
});
