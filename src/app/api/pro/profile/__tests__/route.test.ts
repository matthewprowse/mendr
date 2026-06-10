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

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}
function authed(tables: Record<string, SupabaseQueryResult | ChainResolver>) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({ tables });
}

// getClaimedProviderId hits providers (array, claimed_by_user_id) first; getProviderRole
// hits providers (maybeSingle, claimed_by_user_id) next. Owner short-circuits both.
const CLAIMED: SupabaseQueryResult = { data: [{ id: 'prov-1' }], error: null };
const OWNER_ROLE: SupabaseQueryResult = { data: { claimed_by_user_id: 'user-1' }, error: null };
function ownerProviders(...tail: SupabaseQueryResult[]) {
    return seq(CLAIMED, OWNER_ROLE, ...tail);
}
function memberTables() {
    return {
        providers: seq({ data: [], error: null }, { data: { claimed_by_user_id: 'other' }, error: null }),
        provider_applications: { data: [], error: null } as SupabaseQueryResult,
        provider_members: seq(
            { data: [{ provider_id: 'prov-1' }], error: null },
            { data: { role: 'member' }, error: null },
        ),
    };
}
function noProviderTables() {
    return {
        providers: { data: [], error: null } as SupabaseQueryResult,
        provider_applications: { data: [], error: null } as SupabaseQueryResult,
        provider_members: { data: [], error: null } as SupabaseQueryResult,
    };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/profile', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('../route');
        expect((await GET()).status).toBe(401);
    });

    it('returns the editable profile for an owner', async () => {
        authed({
            providers: ownerProviders({
                data: {
                    name: 'Acme Plumbing',
                    summary_long: 'We fix taps.',
                    about: null,
                    past_work: null,
                    website: null,
                    phone: null,
                    highlights: ['Fast'],
                    specialisations: [],
                    years_in_business: 7,
                },
                error: null,
            }),
        });
        const { GET } = await import('../route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.role).toBe('owner');
        expect(body.profile.name).toBe('Acme Plumbing');
        expect(body.profile.years_in_business).toBe(7);
        expect(body.profile.highlights).toEqual(['Fast']);
    });
});

describe('PATCH /api/pro/profile', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { PATCH } = await import('../route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { profile: { name: 'X' } } }));
        expect(res.status).toBe(401);
    });

    it('403 when the user has no claimed provider', async () => {
        authed(noProviderTables());
        const { PATCH } = await import('../route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { profile: { name: 'X' } } }));
        expect(res.status).toBe(403);
    });

    it('403 when the user is only a member', async () => {
        authed(memberTables());
        const { PATCH } = await import('../route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { profile: { summary_long: 'Hello' } } }),
        );
        expect(res.status).toBe(403);
    });

    it('400 when the body has no profile', async () => {
        authed({ providers: ownerProviders() });
        const { PATCH } = await import('../route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: {} }));
        expect(res.status).toBe(400);
    });

    it('saves and merges provenance on the happy path', async () => {
        authed({
            providers: ownerProviders(
                { data: { field_sources: { name: 'google' } }, error: null },
                { data: null, error: null },
            ),
        });
        const { PATCH } = await import('../route');
        const res = await PATCH(
            makeRequest({
                method: 'PATCH',
                body: { profile: { summary_long: 'We install and repair geysers across Cape Town.' } },
            }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
