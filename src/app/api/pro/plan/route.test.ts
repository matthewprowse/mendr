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

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

/** Owner of PROV. getProviderRole resolves to owner from providers.claimed_by_user_id. */
function owner(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: seq(
                { data: [{ id: PROV }], error: null }, // getClaimedProviderId
                { data: { claimed_by_user_id: 'user-1' }, error: null }, // getProviderRole
                { data: { plan: 'team' }, error: null }, // route body (plan read / update)
            ),
            ...tables,
        },
    });
}

/** Plain member of PROV (not owner). */
function member(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: seq(
                { data: [{ id: PROV }], error: null },
                { data: { claimed_by_user_id: 'someone-else' }, error: null },
            ),
            provider_members: { data: { role: 'member' }, error: null },
            ...tables,
        },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/plan', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns the plan, seat usage and role', async () => {
        owner({ provider_members: { data: null, error: null, count: 3 } });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.plan).toBe('team');
        expect(body.seatsUsed).toBe(3);
        expect(body.role).toBe('owner');
    });
});

describe('PATCH /api/pro/plan', () => {
    it('403 when the caller is not the owner', async () => {
        member();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { plan: 'business' } }))).status).toBe(403);
    });

    it('400 on an unknown plan', async () => {
        owner();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { plan: 'enterprise' } }))).status).toBe(400);
    });

    it('409 when downgrading below current seat usage', async () => {
        owner({ provider_members: { data: null, error: null, count: 3 } });
        const { PATCH } = await import('./route');
        // starter allows 1 seat, team has 3 → blocked
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { plan: 'starter' } }));
        expect(res.status).toBe(409);
    });

    it('changes the plan when seats fit', async () => {
        owner({ provider_members: { data: null, error: null, count: 3 } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { plan: 'business' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).plan).toBe('business');
    });
});
