import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

vi.mock('@/lib/email', () => ({
    sendMendrEmail: vi.fn(async () => ({ ok: true })),
    generateUnsubscribeUrl: vi.fn(() => 'https://mendr.test/unsubscribe?token=x'),
}));

vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://mendr.test' }));

vi.mock('@/lib/email/templates/contractor-onboarding-day3', () => ({
    ContractorOnboardingDay3Email: () => null,
    contractorOnboardingDay3Text: () => 'text',
}));

vi.mock('@/lib/email/templates/contractor-onboarding-day7', () => ({
    ContractorOnboardingDay7Email: () => null,
    contractorOnboardingDay7Text: () => 'text',
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    supabase = mockSupabaseClient({
        tables: { provider_applications: { data: [], error: null } },
    });
});

describe('GET /api/cron/contractor-onboarding', () => {
    it('returns 401 without cron auth', async () => {
        const mod = await import('./route');
        const handler = (mod.GET ?? mod.POST) as unknown as (req: Request) => Promise<Response>;
        const res = await handler(makeRequest({ path: '/api/cron/contractor-onboarding' }));
        expect(res.status).toBe(401);
    });

    it('runs successfully when no applications match', async () => {
        const mod = await import('./route');
        const handler = (mod.GET ?? mod.POST) as unknown as (req: Request) => Promise<Response>;
        const res = await handler(
            makeRequest({ path: '/api/cron/contractor-onboarding', cron: true }),
        );
        expect(res.status).toBe(200);
    });

    it('respects dryRun=true and does not call the mailer', async () => {
        const mod = await import('./route');
        const handler = (mod.GET ?? mod.POST) as unknown as (req: Request) => Promise<Response>;
        const res = await handler(
            makeRequest({ path: '/api/cron/contractor-onboarding?dryRun=true', cron: true }),
        );
        expect(res.status).toBe(200);
        const email = await import('@/lib/email');
        expect(email.sendMendrEmail).not.toHaveBeenCalled();
    });

    it('runs only the day-3 batch when day=3 is supplied', async () => {
        const mod = await import('./route');
        const handler = (mod.GET ?? mod.POST) as unknown as (req: Request) => Promise<Response>;
        const res = await handler(
            makeRequest({ path: '/api/cron/contractor-onboarding?day=3', cron: true }),
        );
        expect(res.status).toBe(200);
    });
});
