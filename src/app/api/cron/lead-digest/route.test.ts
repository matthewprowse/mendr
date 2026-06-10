import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/email', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/email')>()),
    sendMendrEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://mendr.test' }));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    supabase = mockSupabaseClient({
        tables: {
            provider_contact_events: { data: [], error: null },
            providers: { data: [], error: null },
        },
    });
});

describe('GET /api/cron/lead-digest', () => {
    it('returns 401 without cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/lead-digest' }));
        expect(res.status).toBe(401);
    });

    it('returns 200 with cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/lead-digest', cron: true }));
        expect(res.status).toBe(200);
    });

    it('returns 400 on invalid month parameter', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/lead-digest?month=invalid', cron: true }));
        expect(res.status).toBe(400);
    });

    it('respects dryRun=true', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/lead-digest?dryRun=true', cron: true }));
        expect(res.status).toBe(200);
    });
});
