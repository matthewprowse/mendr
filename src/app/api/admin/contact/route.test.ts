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

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: { contact_messages: { data: [{ id: 'm1' }], error: null } },
    });
});

describe('GET /api/admin/contact', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/contact' }));
        expect(res.status).toBe(401);
    });

    it('returns the contact_messages list', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/contact' }));
        expect(res.status).toBe(200);
    });

    it('returns 500 when DB errors', async () => {
        supabase = mockSupabaseClient({
            tables: { contact_messages: { data: null, error: { message: 'db down' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/contact' }));
        expect(res.status).toBe(500);
    });
});

describe('PATCH /api/admin/contact', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'm1', status: 'read' } }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'read' } }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when nothing to update', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'm1' } }));
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'm1', status: 'read' } }));
        expect(res.status).toBe(200);
    });
});
