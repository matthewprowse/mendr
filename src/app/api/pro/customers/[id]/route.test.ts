import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
    type SupabaseQueryResult,
    type ChainResolver,
} from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const PROV = 'prov-1';
const ID = '11111111-1111-4111-8111-111111111111';

/** Return successive results for repeated queries on the same table. */
function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

function params(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/pro/customers/[id]', () => {
    it('400 on an invalid id', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { name: 'X' } }), params('not-a-uuid'));
        expect(res.status).toBe(400);
    });

    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { name: 'X' } }), params(ID));
        expect(res.status).toBe(401);
    });

    it('403 when the user has no claimed provider', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [], error: null },
            },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { name: 'X' } }), params(ID));
        expect(res.status).toBe(403);
    });

    it('400 when there is nothing to update', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: { providers: { data: [{ id: PROV }], error: null } },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: {} }), params(ID));
        expect(res.status).toBe(400);
    });

    it('404 when the customer belongs to another provider', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [{ id: PROV }], error: null },
                provider_customers: { data: { provider_id: 'other-prov' }, error: null },
            },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { name: 'X' } }), params(ID));
        expect(res.status).toBe(404);
    });

    it('updates an owned customer', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [{ id: PROV }], error: null },
                provider_customers: seq(
                    { data: { provider_id: PROV }, error: null },
                    { data: null, error: null },
                ),
            },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { name: '  New name ', email: '' } }),
            params(ID),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
