import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

vi.mock('@/lib/providers/provider-enrichment', () => ({
    enrichProvider: vi.fn(async (id: string) => ({ ok: true, providerId: id })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    supabase = mockSupabaseClient({
        tables: {
            provider_cache: { data: [{ provider_id: 'p1' }], error: null },
        },
    });
});

describe('GET /api/cron/retry-enrichment', () => {
    it('returns 401 without cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/retry-enrichment' }));
        expect(res.status).toBe(401);
    });

    it('returns 200 with attempted + outcomes on happy path', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/retry-enrichment', cron: true }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(typeof body.attempted).toBe('number');
        expect(Array.isArray(body.outcomes)).toBe(true);
    });

    it('returns 500 when the first DB query errors', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_cache: { data: null, error: { message: 'db down' } },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/retry-enrichment', cron: true }));
        expect(res.status).toBe(500);
    });

    it('deduplicates provider IDs across failed/low/stuck buckets', async () => {
        // All three queries return the same provider id; outcomes should have one entry.
        supabase = mockSupabaseClient({
            tables: {
                provider_cache: { data: [{ provider_id: 'p1' }], error: null },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/retry-enrichment', cron: true }));
        const body = await res.json();
        expect(body.attempted).toBe(1);
    });
});
