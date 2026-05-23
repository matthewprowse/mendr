import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let denyAdmin = false;
let sendResult: { ok: boolean; error?: string } = { ok: true };

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
vi.mock('@/lib/resend-mail', () => ({
    sendScandioEmail: vi.fn(async () => sendResult),
    confirmationEmail: vi.fn(() => ({ text: 't', html: '<h/>' })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    sendResult = { ok: true };
    supabase = mockSupabaseClient({
        tables: {
            provider_applications: {
                data: {
                    id: 'app-1',
                    contact_name: 'Ada Lovelace',
                    business_name: 'Lovelace Plumbing',
                    email: 'ada@example.com',
                },
                error: null,
            },
        },
    });
});

describe('POST /api/admin/provider-applications/resend-confirmation', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { id: 'app-1' } }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns 404 when application missing', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'no row' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { id: 'app-1' } }));
        expect(res.status).toBe(404);
    });

    it('returns 500 when send fails', async () => {
        sendResult = { ok: false, error: 'resend down' };
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { id: 'app-1' } }));
        expect(res.status).toBe(500);
    });

    it('returns ok on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { id: 'app-1' } }));
        expect(res.status).toBe(200);
    });
});
