import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let denyAdmin = false;
let resendError: { message: string } | null = null;

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
vi.mock('resend', () => ({
    Resend: vi.fn(function (this: object) {
        Object.assign(this, {
            emails: { send: vi.fn(async () => ({ data: { id: 'x' }, error: resendError })) },
        });
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    resendError = null;
    supabase = mockSupabaseClient({
        tables: { provider_applications: { data: null, error: null } },
    });
    process.env.RESEND_API_KEY = 'rk';
    process.env.RESEND_FROM = 'Menda <noreply@menda.test>';
});

const validBody = {
    providerId: 'pa-1',
    subject: 'Welcome',
    body: 'Hello',
    email: 'pro@example.com',
    name: 'Pro Co',
};

describe('POST /api/admin/send-email', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(401);
    });

    it('returns 500 when Resend is unconfigured', async () => {
        delete process.env.RESEND_API_KEY;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(500);
    });

    it('returns 400 when fields missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, subject: '' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 500 when Resend send fails', async () => {
        resendError = { message: 'resend down' };
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(500);
    });

    it('returns ok on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(200);
    });
});
