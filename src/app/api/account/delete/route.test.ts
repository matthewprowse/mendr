import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

beforeEach(() => vi.clearAllMocks());

describe('POST /api/account/delete', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { confirmEmail: 'a@b.co' } }))).status).toBe(401);
    });

    it('400 for an anonymous account with no email', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { confirmEmail: '' } }))).status).toBe(400);
    });

    it('400 when the confirmation email does not match', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1', email: 'a@b.co' } });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { confirmEmail: 'wrong@b.co' } }))).status).toBe(400);
    });

    it('deletes the user when the email matches (case-insensitive)', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1', email: 'A@B.co' } });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { confirmEmail: ' a@b.co ' } }));
        expect(res.status).toBe(200);
        expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith('user-1');
    });

    it('500 when the delete fails', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1', email: 'a@b.co' } });
        adminClient = mockSupabaseClient();
        adminClient.auth.admin.deleteUser = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { confirmEmail: 'a@b.co' } }))).status).toBe(500);
    });
});
