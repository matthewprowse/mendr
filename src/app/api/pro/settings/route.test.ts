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

function owner(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: seq(
                { data: [{ id: PROV }], error: null },
                { data: { claimed_by_user_id: 'user-1' }, error: null },
                { data: { callout_fee: 0 }, error: null }, // profile read / update
            ),
            ...tables,
        },
    });
}

function member(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: {
            providers: seq(
                { data: [{ id: PROV }], error: null },
                { data: { claimed_by_user_id: 'other' }, error: null },
            ),
            provider_members: { data: { role: 'member' }, error: null },
            ...tables,
        },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/settings', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns role, profile and notification preferences', async () => {
        owner({
            provider_notification_preferences: { data: { new_enquiry: false, preferred_channel: 'sms' }, error: null },
        });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.role).toBe('owner');
        expect(body.profile).toEqual({ callout_fee: 0 });
        expect(body.notifications).toEqual({ new_enquiry: false, preferred_channel: 'sms' });
    });

    it('falls back to default notification preferences when none exist', async () => {
        owner({ provider_notification_preferences: { data: null, error: null } });
        const { GET } = await import('./route');
        const res = await GET();
        const body = await res.json();
        expect(body.notifications.new_enquiry).toBe(true);
        expect(body.notifications.preferred_channel).toBe('email');
    });
});

describe('PATCH /api/pro/settings', () => {
    it('403 when a member tries to edit the business profile', async () => {
        member();
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { profile: { callout_fee: 250 } } }),
        );
        expect(res.status).toBe(403);
    });

    it('lets an owner edit the business profile', async () => {
        owner();
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({
                method: 'PATCH',
                body: { profile: { callout_fee: 250, preferred_contact_channel: 'whatsapp' } },
            }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(adminClient.from).toHaveBeenCalledWith('providers');
    });

    it('lets any teammate update their own notification preferences', async () => {
        member({ provider_notification_preferences: { data: null, error: null } });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({
                method: 'PATCH',
                body: { notifications: { new_enquiry: false, quiet_hours_start: 22, preferred_channel: 'sms' } },
            }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(adminClient.from).toHaveBeenCalledWith('provider_notification_preferences');
    });
});
