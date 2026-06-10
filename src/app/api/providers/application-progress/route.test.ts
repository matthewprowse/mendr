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
        tables: { provider_applications: { data: [{ id: 'a1' }], error: null } },
    });
});

describe('GET /api/providers/application-progress', () => {
    it('returns null application for an anonymous caller (no phone oracle)', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/providers/application-progress?phone=%2B27821234567' }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.application).toBeNull();
    });

    it('returns the owner their own application', async () => {
        authUser = { id: OWNER };
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/application-progress' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.application?.id).toBe('a1');
    });

    it('returns 500 when DB errors for an authenticated owner', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/application-progress' }));
        expect(res.status).toBe(500);
    });
});

describe('DELETE /api/providers/application-progress', () => {
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
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: { id: 'a1' } }));
        expect(res.status).toBe(200);
    });
});
