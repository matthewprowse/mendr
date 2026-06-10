import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

import {
    getClaimedProviderId,
    getProviderRole,
    getProviderState,
} from '@/lib/providers/claimed-provider';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getClaimedProviderId', () => {
    it('returns the directly claimed provider first', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [{ id: 'prov-direct' }], error: null },
                provider_applications: { data: [{ matched_provider_id: 'prov-app' }], error: null },
                provider_members: { data: [{ provider_id: 'prov-member' }], error: null },
            },
        });
        expect(await getClaimedProviderId('user-1')).toBe('prov-direct');
    });

    it('falls back to the approved application when no direct claim', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [{ matched_provider_id: 'prov-app' }], error: null },
                provider_members: { data: [{ provider_id: 'prov-member' }], error: null },
            },
        });
        expect(await getClaimedProviderId('user-1')).toBe('prov-app');
    });

    it('skips an approved application whose matched_provider_id is null', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [{ matched_provider_id: null }], error: null },
                provider_members: { data: [{ provider_id: 'prov-member' }], error: null },
            },
        });
        expect(await getClaimedProviderId('user-1')).toBe('prov-member');
    });

    it('falls back to an active membership when no claim or application', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [{ provider_id: 'prov-member' }], error: null },
            },
        });
        expect(await getClaimedProviderId('user-1')).toBe('prov-member');
    });

    it('returns null when the user is linked to nothing', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [], error: null },
            },
        });
        expect(await getClaimedProviderId('user-1')).toBeNull();
    });
});

describe('getProviderRole', () => {
    it('returns owner when the user is the claimer', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { claimed_by_user_id: 'user-1' }, error: null },
                provider_members: { data: { role: 'admin' }, error: null },
            },
        });
        expect(await getProviderRole('user-1', 'prov-1')).toBe('owner');
    });

    it('returns the membership role when not the claimer', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { claimed_by_user_id: 'someone-else' }, error: null },
                provider_members: { data: { role: 'admin' }, error: null },
            },
        });
        expect(await getProviderRole('user-1', 'prov-1')).toBe('admin');
    });

    it('returns null when neither claimer nor an active member', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { claimed_by_user_id: 'someone-else' }, error: null },
                provider_members: { data: null, error: null },
            },
        });
        expect(await getProviderRole('user-1', 'prov-1')).toBeNull();
    });

    it('returns null when the provider row is missing', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: null, error: null },
                provider_members: { data: null, error: null },
            },
        });
        expect(await getProviderRole('user-1', 'prov-1')).toBeNull();
    });
});

describe('getProviderState', () => {
    it('reports the claimed provider and not pending', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [{ id: 'prov-1' }], error: null },
            },
        });
        expect(await getProviderState('user-1')).toEqual({ providerId: 'prov-1', pending: false });
    });

    it('reports pending when no provider but a claim is under review', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [], error: null },
                provider_claims: { data: [{ id: 'claim-1' }], error: null },
            },
        });
        expect(await getProviderState('user-1')).toEqual({ providerId: null, pending: true });
    });

    it('reports neither provider nor pending when there is nothing', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [], error: null },
                provider_claims: { data: [], error: null },
            },
        });
        expect(await getProviderState('user-1')).toEqual({ providerId: null, pending: false });
    });
});
