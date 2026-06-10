import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const PROVIDER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => vi.clearAllMocks());

describe('POST /api/account/consents/revoke', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { providerId: PROVIDER } }))).status).toBe(401);
    });

    it('400 on a malformed providerId', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { providerId: 'nope' } }))).status).toBe(400);
    });

    it('stamps revoked_at on the homeowner + specialist rows', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({ tables: { lead_contact_consents: { data: null, error: null } } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: PROVIDER } }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(adminClient.from).toHaveBeenCalledWith('lead_contact_consents');
    });

    it('500 when the update errors', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({ tables: { lead_contact_consents: { data: null, error: { message: 'db' } } } });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { providerId: PROVIDER } }))).status).toBe(500);
    });
});
