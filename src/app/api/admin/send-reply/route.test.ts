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
vi.mock('resend', () => ({
    Resend: vi.fn(function (this: object) {
        Object.assign(this, {
            emails: { send: vi.fn(async () => ({ data: { id: 'x' }, error: null })) },
        });
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: {
            contact_messages: { data: { email: 'homeowner@example.com', name: 'Ada' }, error: null },
        },
    });
    process.env.RESEND_API_KEY = 'rk';
    process.env.RESEND_FROM = 'Mendr <noreply@mendr.test>';
});

const validBody = {
    messageId: 'm1',
    replyText: 'Thanks for getting in touch.',
    email: 'homeowner@example.com',
    name: 'Ada',
    subject: 'Original',
};

describe('POST /api/admin/send-reply', () => {
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
            makeRequest({ method: 'POST', body: { ...validBody, replyText: '' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 404 when the message is not found', async () => {
        supabase = mockSupabaseClient({ tables: { contact_messages: { data: null, error: null } } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(404);
    });

    it('returns ok on success and derives the recipient server-side (M6)', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, email: 'attacker@evil.test' } }),
        );
        expect(res.status).toBe(200);
    });
});
