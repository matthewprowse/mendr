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
        tables: { provider_contact_events: { data: [], error: null } },
    });
});

describe('GET /api/cron/send-rating-requests', () => {
    it('returns 401 without cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/send-rating-requests' }));
        expect(res.status).toBe(401);
    });

    it('returns 200 with cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/send-rating-requests', cron: true }));
        expect(res.status).toBe(200);
    });

    it('respects dryRun', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/send-rating-requests?dryRun=true', cron: true }));
        expect(res.status).toBe(200);
    });

    it('returns 500 when the contact events fetch fails', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_contact_events: { data: null, error: { message: 'db fail' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/send-rating-requests', cron: true }));
        expect(res.status).toBe(500);
    });
});
