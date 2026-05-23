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
    invitationEmail: vi.fn(() => ({ text: 't', html: '<h/>' })),
}));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://mendr.test' }));

function appRow(geminiSummary: string | null) {
    return {
        data: {
            id: 'app-1',
            contact_name: 'Ada Lovelace',
            email: 'ada@example.com',
            gemini_summary: geminiSummary,
            applicant_summary: null,
        },
        error: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    sendResult = { ok: true };
    supabase = mockSupabaseClient({
        tables: {
            provider_applications: appRow('A good summary.'),
            provider_application_edit_tokens: { data: null, error: null },
        },
    });
});

describe('POST /api/admin/provider-applications/send-invitation', () => {
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
            tables: {
                provider_applications: { data: null, error: { message: 'no row' } },
                provider_application_edit_tokens: { data: null, error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { id: 'app-1' } }));
        expect(res.status).toBe(404);
    });

    it('returns 422 when no summary and force not set', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_applications: appRow(null),
                provider_application_edit_tokens: { data: null, error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { id: 'app-1' } }));
        expect(res.status).toBe(422);
    });

    it('returns ok with force=true even without summary', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_applications: appRow(null),
                provider_application_edit_tokens: { data: null, error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { id: 'app-1', force: true } }),
        );
        expect(res.status).toBe(200);
    });

    it('returns 500 when send fails', async () => {
        sendResult = { ok: false, error: 'send fail' };
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
