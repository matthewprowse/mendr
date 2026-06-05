import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}
function authed(tables: Record<string, { data: unknown; error: unknown }> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1', email: 'a@b.co' } });
    adminClient = mockSupabaseClient({ tables });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/account/profile', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns the shaped profile', async () => {
        authed({ profiles: { data: { first_name: 'Ada', surname: 'L', description: 'hi', avatar_url: null, locations: [], created_at: 't' }, error: null } });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body).toMatchObject({ email: 'a@b.co', firstName: 'Ada', surname: 'L', description: 'hi' });
    });

    it('500 when the query errors', async () => {
        authed({ profiles: { data: null, error: { message: 'db' } } });
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(500);
    });
});

describe('PATCH /api/account/profile', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { first_name: 'X' } }))).status).toBe(401);
    });

    it('400 when nothing to update', async () => {
        authed();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { not_allowed: 'x' } }))).status).toBe(400);
    });

    it('updates the allowed fields', async () => {
        authed({ profiles: { data: null, error: null } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { first_name: '  Ada ', description: 'hi' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.first_name).toBe('Ada');
    });
});
