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
const ID = '33333333-3333-4333-8333-333333333333';

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

function params(id: string) {
    return { params: Promise.resolve({ id }) };
}

/** Owner of PROV, with the target member row(s) supplied via provider_members. */
function owner(members: SupabaseQueryResult | ChainResolver) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: seq(
                { data: [{ id: PROV }], error: null },
                { data: { claimed_by_user_id: 'user-1' }, error: null },
            ),
            provider_members: members,
        },
    });
}

/** Caller whose role comes from a membership row (non-owner). */
function asRole(role: 'admin' | 'member', members: SupabaseQueryResult | ChainResolver) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: seq(
                { data: [{ id: PROV }], error: null },
                { data: { claimed_by_user_id: 'other' }, error: null },
            ),
            provider_members: typeof members === 'function'
                ? members
                : seq({ data: { role }, error: null }, members),
        },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/pro/members/[id]', () => {
    it('400 on an invalid id', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { role: 'admin' } }), params('nope'))).status).toBe(400);
    });

    it('403 when the caller is not the owner', async () => {
        asRole('admin', { data: { role: 'member' }, error: null });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { role: 'admin' } }), params(ID))).status).toBe(403);
    });

    it('404 when the member belongs to another provider', async () => {
        owner({ data: { provider_id: 'other', role: 'member', status: 'active' }, error: null });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { role: 'admin' } }), params(ID))).status).toBe(404);
    });

    it('409 when changing the owner role', async () => {
        owner({ data: { provider_id: PROV, role: 'owner', status: 'active' }, error: null });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { role: 'admin' } }), params(ID))).status).toBe(409);
    });

    it('changes a teammate role', async () => {
        owner(seq(
            { data: { provider_id: PROV, role: 'member', status: 'active' }, error: null },
            { data: null, error: null },
        ));
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { role: 'admin' } }), params(ID));
        expect(res.status).toBe(200);
        expect((await res.json()).role).toBe('admin');
    });
});

describe('DELETE /api/pro/members/[id]', () => {
    it('403 when a plain member tries to remove someone', async () => {
        asRole('member', { data: { provider_id: PROV, role: 'member', status: 'active' }, error: null });
        const { DELETE } = await import('./route');
        expect((await DELETE(makeRequest({ method: 'DELETE' }), params(ID))).status).toBe(403);
    });

    it('409 when removing the owner', async () => {
        owner({ data: { provider_id: PROV, role: 'owner', status: 'active' }, error: null });
        const { DELETE } = await import('./route');
        expect((await DELETE(makeRequest({ method: 'DELETE' }), params(ID))).status).toBe(409);
    });

    it('403 when an admin tries to remove another admin', async () => {
        asRole('admin', seq(
            { data: { role: 'admin' }, error: null }, // getProviderRole
            { data: { provider_id: PROV, role: 'admin', status: 'active' }, error: null }, // loadTarget
        ));
        const { DELETE } = await import('./route');
        expect((await DELETE(makeRequest({ method: 'DELETE' }), params(ID))).status).toBe(403);
    });

    it('removes a teammate', async () => {
        owner(seq(
            { data: { provider_id: PROV, role: 'member', status: 'active' }, error: null },
            { data: null, error: null },
        ));
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE' }), params(ID));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
