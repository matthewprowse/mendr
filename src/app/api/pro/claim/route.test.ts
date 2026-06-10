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

const TARGET = '22222222-2222-4222-8222-222222222222';

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

/** Sets up an authed user whose getClaimedProviderId resolves to null. */
function authedUnclaimed(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            provider_applications: { data: [], error: null },
            provider_members: { data: [], error: null },
            ...tables,
        },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/pro/claim', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { providerId: TARGET } }))).status).toBe(401);
    });

    it('400 when providerId is missing or malformed', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { providerId: 'nope' } }))).status).toBe(400);
    });

    it('409 when the user has already claimed a business', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: { providers: { data: [{ id: 'existing' }], error: null } },
        });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { providerId: TARGET } }))).status).toBe(409);
    });

    it('409 when the user already has a claim under review', async () => {
        authedUnclaimed({
            providers: { data: [], error: null },
            provider_claims: { data: [{ id: 'claim-1' }], error: null },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: TARGET } }));
        expect(res.status).toBe(409);
    });

    it('404 when the target business does not exist', async () => {
        authedUnclaimed({
            // getClaimedProviderId list (empty), then target lookup (null)
            providers: seq({ data: [], error: null }, { data: null, error: null }),
            provider_claims: { data: [], error: null },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: TARGET } }));
        expect(res.status).toBe(404);
    });

    it('409 when the target business is already claimed', async () => {
        authedUnclaimed({
            providers: seq(
                { data: [], error: null },
                { data: { id: TARGET, claimed_by_user_id: 'someone', merged_into: null }, error: null },
            ),
            provider_claims: { data: [], error: null },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: TARGET } }));
        expect(res.status).toBe(409);
    });

    it('409 when someone else is already claiming the business', async () => {
        authedUnclaimed({
            providers: seq(
                { data: [], error: null },
                { data: { id: TARGET, claimed_by_user_id: null, merged_into: null }, error: null },
            ),
            // own-pending (empty), then provider-pending (one row)
            provider_claims: seq({ data: [], error: null }, { data: [{ id: 'other-claim' }], error: null }),
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: TARGET } }));
        expect(res.status).toBe(409);
    });

    it('records a pending claim on the happy path', async () => {
        authedUnclaimed({
            providers: seq(
                { data: [], error: null },
                { data: { id: TARGET, claimed_by_user_id: null, merged_into: null }, error: null },
            ),
            // own-pending, provider-pending, then insert
            provider_claims: seq(
                { data: [], error: null },
                { data: [], error: null },
                { data: null, error: null },
            ),
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: TARGET } }));
        expect(res.status).toBe(200);
        expect((await res.json())).toEqual({ ok: true, status: 'pending' });
    });
});
