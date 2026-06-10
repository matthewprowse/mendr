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
const NO_USER = { get_user_id_by_email: { data: null, error: null } };

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

function owner(
    tables: Record<string, SupabaseQueryResult | ChainResolver> = {},
    rpc: Record<string, SupabaseQueryResult> = NO_USER,
) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: seq(
                { data: [{ id: PROV }], error: null }, // getClaimedProviderId
                { data: { claimed_by_user_id: 'user-1' }, error: null }, // getProviderRole → owner
                { data: { plan: 'team' }, error: null }, // POST seat-limit plan read
            ),
            ...tables,
        },
        rpc,
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/members', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('403 when not on the team', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: seq(
                    { data: [{ id: PROV }], error: null },
                    { data: { claimed_by_user_id: 'other' }, error: null },
                ),
                provider_members: { data: null, error: null },
            },
        });
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(403);
    });

    it('returns the roster with resolved names and the caller role', async () => {
        owner({
            provider_members: {
                data: [
                    { id: 'm1', user_id: 'user-1', role: 'owner', invited_email: null, status: 'active', created_at: 't' },
                    { id: 'm2', user_id: null, role: 'member', invited_email: 'pal@x.co', status: 'invited', created_at: 't' },
                ],
                error: null,
            },
            profiles: { data: [{ user_id: 'user-1', first_name: 'Ada', surname: 'Lovelace' }], error: null },
        });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.role).toBe('owner');
        expect(body.members).toHaveLength(2);
        expect(body.members[0]).toMatchObject({ name: 'Ada Lovelace', isYou: true });
        expect(body.members[1]).toMatchObject({ name: 'pal@x.co', isYou: false });
    });
});

describe('POST /api/pro/members', () => {
    it('403 when a plain member tries to invite', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: seq(
                    { data: [{ id: PROV }], error: null },
                    { data: { claimed_by_user_id: 'other' }, error: null },
                ),
                provider_members: { data: { role: 'member' }, error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { email: 'new@x.co' } }));
        expect(res.status).toBe(403);
    });

    it('400 on an invalid email', async () => {
        owner();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { email: 'not-an-email' } }))).status).toBe(400);
    });

    it('409 when the person is already on the team', async () => {
        owner({ provider_members: { data: [{ id: 'm9', status: 'active' }], error: null } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { email: 'dupe@x.co' } }));
        expect(res.status).toBe(409);
    });

    it('409 when the seat limit is reached', async () => {
        owner({
            // dupe check (none), then seat count = 1 (starter allows 1)
            provider_members: seq({ data: [], error: null }, { data: null, error: null, count: 1 }),
            providers: seq(
                { data: [{ id: PROV }], error: null },
                { data: { claimed_by_user_id: 'user-1' }, error: null },
                { data: { plan: 'starter' }, error: null },
            ),
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { email: 'new@x.co' } }));
        expect(res.status).toBe(409);
    });

    it('invites a brand-new email as a pending invite', async () => {
        owner({
            provider_members: seq(
                { data: [], error: null }, // dupe
                { data: null, error: null, count: 1 }, // seat count (team allows 5)
                { data: { id: 'm1', status: 'invited' }, error: null }, // insert
            ),
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { email: 'New@X.co', role: 'admin' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.linked).toBe(false);
        expect(body.member).toEqual({ id: 'm1', status: 'invited' });
    });

    it('links an existing account immediately', async () => {
        owner(
            {
                provider_members: seq(
                    { data: [], error: null },
                    { data: null, error: null, count: 1 },
                    { data: { id: 'm1', status: 'active' }, error: null },
                ),
            },
            { get_user_id_by_email: { data: 'user-2', error: null } },
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { email: 'known@x.co' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).linked).toBe(true);
    });
});
