import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));
vi.mock('@/lib/resend-mail', () => ({
    sendScandioEmail: vi.fn(async () => ({ ok: true })),
    confirmationEmail: vi.fn(() => ({ text: 'text', html: '<html />' })),
}));
vi.mock('@/lib/site-url', () => ({ getAppOrigin: () => 'https://mendr.test' }));

beforeEach(() => {
    vi.clearAllMocks();
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient({
        tables: { provider_applications: { data: { id: 'app-1' }, error: null } },
    });
    delete process.env.CRON_SECRET; // disable fire-and-forget enrichment trigger
});

const fullBody = {
    contractorType: 'individual',
    willingnessToPayBand: 'R500-R1000',
    businessName: 'Pro Co',
    contactPerson: 'Ada Lovelace',
    emailAddress: 'ada@example.com',
    address: '123 Main St',
    serviceAreas: 'Cape Town',
    phone: '+27821234567',
    trade: 'Plumbing',
    specialisations: 'burst pipes',
    foundedYear: '2018',
};

describe('POST /api/providers/apply — validation', () => {
    it('returns 400 on malformed body', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when contractorType invalid', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...fullBody, contractorType: 'wizard' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when willingnessToPayBand missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...fullBody, willingnessToPayBand: '' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when email malformed', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...fullBody, emailAddress: 'not-email' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when required field missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...fullBody, businessName: '' } }),
        );
        expect(res.status).toBe(400);
    });
});

describe('POST /api/providers/apply — happy path', () => {
    it('returns { ok: true } on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: fullBody }));
        expect(res.status).toBe(200);
    });

    it('returns 500 when DB insert fails', async () => {
        adminClient = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'db' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: fullBody }));
        expect(res.status).toBe(500);
    });
});

describe('POST /api/providers/apply — rate limit', () => {
    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: fullBody }));
        expect(res.status).toBe(429);
    });
});
