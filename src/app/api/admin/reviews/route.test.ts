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
        tables: { reviews: { data: [{ id: 'r1' }], error: null } },
    });
});

describe('GET /api/admin/reviews', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/reviews' }));
        expect(res.status).toBe(401);
    });

    it('returns the review list', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/reviews' }));
        expect(res.status).toBe(200);
    });
});

describe('PATCH /api/admin/reviews', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'r1', status: 'approved' } }),
        );
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'approved' } }));
        expect(res.status).toBe(400);
    });

    it('returns 400 on invalid status', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'r1', status: 'X' } }));
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'r1', status: 'approved' } }),
        );
        expect(res.status).toBe(200);
    });
});
