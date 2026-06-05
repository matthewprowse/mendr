import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let authUser: { id: string } | null = null;
const OWNER = 'owner-user-1';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
    createSupabaseServerClient: vi.fn(async () => mockSupabaseClient({ user: authUser })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    authUser = null;
    supabase = mockSupabaseClient({
        tables: { provider_applications: { data: { id: 'a1' }, error: null } },
    });
});

describe('GET /api/providers/application-session', () => {
    it('returns null application for an anonymous caller (no phone/ip oracle)', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({
                path: '/api/providers/application-session?phone=0821234567',
                headers: { 'x-forwarded-for': '1.2.3.4' },
            }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.application).toBeNull();
    });

    it('returns 500 on DB error for an authenticated owner', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/application-session' }));
        expect(res.status).toBe(500);
    });

    it('returns the owner their own application', async () => {
        authUser = { id: OWNER };
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/application-session' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.application?.id).toBe('a1');
    });
});

describe('DELETE /api/providers/application-session', () => {
    it('returns 401 for an anonymous caller', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: { id: 'a1' } }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        authUser = { id: OWNER };
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns 404 when the id is not owned by the caller', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: [], error: null } },
        });
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: { id: 'someone-elses' } }));
        expect(res.status).toBe(404);
    });

    it('deletes the owner own application', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: [{ id: 'a1' }], error: null } },
        });
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: { id: 'a1' } }));
        expect(res.status).toBe(200);
    });
});
