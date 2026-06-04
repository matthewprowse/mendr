import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

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
        tables: { provider_applications: { data: [{ id: 'app-1' }], error: null } },
    });
});

describe('GET /api/admin/providers', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/providers' }));
        expect(res.status).toBe(401);
    });

    it('returns provider applications', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/providers' }));
        expect(res.status).toBe(200);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/providers' }));
        expect(res.status).toBe(500);
    });
});

describe('POST /api/admin/providers — manual application', () => {
    const validBody = {
        business_name: 'Acme Plumbing',
        contact_name: 'Jane Doe',
        email: 'jane@acme.test',
        phone: '0210000000',
        address: '1 Main Rd, Cape Town',
        trade: 'Plumbing',
    };

    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when required fields are missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { business_name: 'Acme' } }),
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/Missing required fields/);
    });

    it('creates an application and returns 201', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(201);
        expect((await res.json()).ok).toBe(true);
    });

    it('returns 500 when the insert errors', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'db' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(500);
    });
});

describe('PATCH /api/admin/providers', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'app-1', status: 'approved' } }),
        );
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'approved' } }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when nothing to update', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'app-1' } }));
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'app-1', status: 'approved' } }),
        );
        expect(res.status).toBe(200);
    });
});
