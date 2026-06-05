import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const PROV = 'prov-1';

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}

/** Authed Pro with a claimed provider. */
function pro(tables: Record<string, { data: unknown; error: unknown }> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: { providers: { data: [{ id: PROV }], error: null }, ...tables },
    });
}

/** Authed user with no claimed provider. */
function unclaimed() {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: { data: [], error: null },
            provider_applications: { data: [], error: null },
            provider_members: { data: [], error: null },
        },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/customers', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('403 when the user has no claimed provider', async () => {
        unclaimed();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(403);
    });

    it('returns the provider customers', async () => {
        pro({ provider_customers: { data: [{ id: 'c1', name: 'Ada' }], error: null } });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        expect((await res.json()).customers).toEqual([{ id: 'c1', name: 'Ada' }]);
    });

    it('500 when the query errors', async () => {
        pro({ provider_customers: { data: null, error: { message: 'boom' } } });
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(500);
    });
});

describe('POST /api/pro/customers', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { name: 'Ada' } }))).status).toBe(401);
    });

    it('400 when name is missing', async () => {
        pro();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: {} }))).status).toBe(400);
    });

    it('creates a customer and returns it', async () => {
        pro({ provider_customers: { data: { id: 'c1', name: 'Ada' }, error: null } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { name: '  Ada  ', phone: '021' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).customer).toEqual({ id: 'c1', name: 'Ada' });
    });
});
