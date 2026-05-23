import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

let verifyImpl: (payload: string, headers: Record<string, string>) => unknown = () => ({
    user: { email: 'u@x.com' },
    email_data: { token: 'tok', email_action_type: 'signup' },
});

vi.mock('standardwebhooks', () => ({
    Webhook: vi.fn().mockImplementation((_secret: string) => ({
        verify: (...args: Parameters<typeof verifyImpl>) => verifyImpl(...args),
    })),
}));

vi.mock('@/lib/auth-email-dispatch', () => ({
    dispatchAuthEmails: vi.fn(async () => undefined),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.SEND_EMAIL_HOOK_SECRET = 'v1,whsec_secret';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
    process.env.RESEND_API_KEY = 'rk';
    process.env.RESEND_FROM = 'Menda <noreply@menda.test>';
});

describe('POST /api/auth/send-email-hook', () => {
    it('returns 500 when SEND_EMAIL_HOOK_SECRET is unset', async () => {
        delete process.env.SEND_EMAIL_HOOK_SECRET;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(500);
    });

    it('returns 500 when Resend is unconfigured', async () => {
        delete process.env.RESEND_API_KEY;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(500);
    });

    it('returns 401 on invalid webhook signature', async () => {
        verifyImpl = () => {
            throw new Error('bad signature');
        };
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(401);
    });

    it('returns 200 on successful dispatch', async () => {
        verifyImpl = () => ({
            user: { email: 'u@x.com' },
            email_data: { token: 'tok', email_action_type: 'signup' },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(200);
    });

    it('returns 500 when dispatch throws', async () => {
        verifyImpl = () => ({ user: { email: 'u@x.com' }, email_data: {} });
        const dispatch = await import('@/lib/auth-email-dispatch');
        vi.mocked(dispatch.dispatchAuthEmails).mockRejectedValueOnce(new Error('send failed'));
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(500);
    });
});
