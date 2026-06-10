import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/email', () => ({
    sendMendrEmail: vi.fn(async () => ({ ok: true })),
    generateUnsubscribeUrl: vi.fn(() => 'https://mendr.test/u'),
}));
vi.mock('@/lib/email/templates/post-diagnosis-followup', () => ({
    PostDiagnosisFollowupEmail: () => null,
    postDiagnosisFollowupText: () => 'text',
}));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://mendr.test' }));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    supabase = mockSupabaseClient({ tables: { diagnoses: { data: [], error: null } } });
});

describe('GET /api/cron/homeowner-followup', () => {
    it('returns 401 without cron auth', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/homeowner-followup' }));
        expect(res.status).toBe(401);
    });

    it('returns 200 with the cron secret', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/homeowner-followup', cron: true }));
        expect(res.status).toBe(200);
    });

    it('respects dryRun=true', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cron/homeowner-followup?dryRun=true', cron: true }),
        );
        expect(res.status).toBe(200);
        const email = await import('@/lib/email');
        expect(email.sendMendrEmail).not.toHaveBeenCalled();
    });
});
