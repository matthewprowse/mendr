import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;
let isAdmin = false;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

vi.mock('@/lib/auth/admin-access', () => ({
    isAdminUser: vi.fn(async () => isAdmin),
}));

import {
    getSessionUserId,
    userOwnsProvider,
    providerClaimState,
    authorizeProviderWrite,
} from '../ownership';

beforeEach(() => {
    vi.clearAllMocks();
    isAdmin = false;
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
});

describe('getSessionUserId', () => {
    it('returns the authenticated user id', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        expect(await getSessionUserId()).toBe('user-1');
    });

    it('returns null for an anonymous caller', async () => {
        serverClient = mockSupabaseClient({ user: null });
        expect(await getSessionUserId()).toBeNull();
    });

    it('returns null when the client throws', async () => {
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        vi.mocked(createSupabaseServerClient).mockRejectedValueOnce(new Error('no headers'));
        expect(await getSessionUserId()).toBeNull();
    });
});

describe('userOwnsProvider', () => {
    it('returns true when a matching application row exists', async () => {
        const admin = mockSupabaseClient({
            tables: { provider_applications: { data: { id: 'app-1' }, error: null } },
        });
        expect(await userOwnsProvider(admin as never, 'user-1', 'prov-1')).toBe(true);
    });

    it('returns false when no application row exists', async () => {
        const admin = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: null } },
        });
        expect(await userOwnsProvider(admin as never, 'user-1', 'prov-1')).toBe(false);
    });
});

describe('providerClaimState', () => {
    it('reports not-existing when the row is missing', async () => {
        const admin = mockSupabaseClient({ tables: { providers: { data: null, error: null } } });
        expect(await providerClaimState(admin as never, 'prov-1')).toEqual({
            exists: false,
            claimed: false,
        });
    });

    it('reports existing and unclaimed when claimed_by_user_id is null', async () => {
        const admin = mockSupabaseClient({
            tables: { providers: { data: { claimed_by_user_id: null }, error: null } },
        });
        expect(await providerClaimState(admin as never, 'prov-1')).toEqual({
            exists: true,
            claimed: false,
        });
    });

    it('reports existing and claimed when claimed_by_user_id is set', async () => {
        const admin = mockSupabaseClient({
            tables: { providers: { data: { claimed_by_user_id: 'user-9' }, error: null } },
        });
        expect(await providerClaimState(admin as never, 'prov-1')).toEqual({
            exists: true,
            claimed: true,
        });
    });
});

describe('authorizeProviderWrite', () => {
    it('returns 404 when the provider does not exist', async () => {
        adminClient = mockSupabaseClient({ tables: { providers: { data: null, error: null } } });
        expect(await authorizeProviderWrite('prov-1')).toEqual({
            ok: false,
            status: 404,
            error: 'Provider not found.',
        });
    });

    it('allows writes to an unclaimed provider', async () => {
        adminClient = mockSupabaseClient({
            tables: { providers: { data: { claimed_by_user_id: null }, error: null } },
        });
        expect(await authorizeProviderWrite('prov-1')).toEqual({ ok: true });
    });

    it('allows the owning user to write to a claimed provider', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { claimed_by_user_id: 'someone' }, error: null },
                provider_applications: { data: { id: 'app-1' }, error: null },
            },
        });
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        expect(await authorizeProviderWrite('prov-1')).toEqual({ ok: true });
    });

    it('allows an admin to write to a claimed provider', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { claimed_by_user_id: 'someone' }, error: null },
                provider_applications: { data: null, error: null },
            },
        });
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        isAdmin = true;
        expect(await authorizeProviderWrite('prov-1')).toEqual({ ok: true });
    });

    it('denies a non-owner non-admin user', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { claimed_by_user_id: 'someone' }, error: null },
                provider_applications: { data: null, error: null },
            },
        });
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        isAdmin = false;
        expect(await authorizeProviderWrite('prov-1')).toEqual({
            ok: false,
            status: 403,
            error: 'You do not have permission to modify this provider.',
        });
    });
});
