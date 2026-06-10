import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let denyAdmin = false;

vi.mock('@/lib/auth/admin-auth', () => ({
    requireAdmin: vi.fn(async () => {
        if (denyAdmin) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return null;
    }),
}));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/email', () => ({
    sendMendrEmail: vi.fn(async () => ({ ok: true })),
    generateUnsubscribeUrl: vi.fn(() => 'https://x/u'),
}));
vi.mock('@/lib/email/templates/contractor-outreach', () => ({
    ContractorOutreachEmail: () => null,
    contractorOutreachText: () => 'text',
}));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://mendr.test' }));

const validContractor = {
    email: 'pro@example.com',
    businessName: 'Pro Co',
    contactCount: 3,
    tradeType: 'Plumbing',
    month: '2026-05',
};

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: { email_suppressions: { data: null, error: null } },
    });
});

describe('POST /api/admin/send-outreach', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { contractors: [validContractor] } }));
        expect(res.status).toBe(401);
    });

    it('returns 400 on invalid JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when contractors is not an array', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { contractors: 'x' } }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when contractor entry malformed', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { contractors: [{ email: 'x' }] },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when too many contractors', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { contractors: Array(51).fill(validContractor) },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns sent counts on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { contractors: [validContractor] } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.sent).toBe(1);
        expect(body.dryRun).toBe(false);
    });

    it('skips suppressed emails', async () => {
        supabase = mockSupabaseClient({
            tables: { email_suppressions: { data: { email: 'pro@example.com' }, error: null } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { contractors: [validContractor] } }),
        );
        const body = await res.json();
        expect(body.skipped).toBe(1);
        expect(body.sent).toBe(0);
    });

    it('honours dryRun=true', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { contractors: [validContractor], dryRun: true },
            }),
        );
        const body = await res.json();
        expect(body.dryRun).toBe(true);
        const email = await import('@/lib/email');
        expect(email.sendMendrEmail).not.toHaveBeenCalled();
    });
});
