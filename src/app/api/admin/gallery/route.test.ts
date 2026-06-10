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
        tables: { provider_images: { data: [{ id: 'img-1' }], error: null } },
    });
});

describe('GET /api/admin/gallery', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/gallery' }));
        expect(res.status).toBe(401);
    });

    it('returns the queue', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/gallery' }));
        expect(res.status).toBe(200);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_images: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/gallery' }));
        expect(res.status).toBe(500);
    });
});

describe('PATCH /api/admin/gallery', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'img-1', status: 'approved' } }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'approved' } }));
        expect(res.status).toBe(400);
    });

    it('returns 400 on invalid status', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'img-1', status: 'wat' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when nothing to update', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'img-1' } }));
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'img-1', status: 'approved' } }),
        );
        expect(res.status).toBe(200);
    });
});

describe('DELETE /api/admin/gallery', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/admin/gallery?id=img-1' }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/admin/gallery' }));
        expect(res.status).toBe(400);
    });

    it('returns { ok: true } on success', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/admin/gallery?id=img-1' }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });

    it('returns 500 when the delete errors', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_images: { data: null, error: { message: 'db' } } },
        });
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/admin/gallery?id=img-1' }));
        expect(res.status).toBe(500);
    });
});
