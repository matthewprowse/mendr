import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
// Result the throwaway re-auth verifier (a separate createClient instance)
// returns. The route verifies the old password here, not on the session client.
let verifierError: { message: string } | null = null;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
}));
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        auth: {
            signInWithPassword: vi.fn(async () => ({ data: {}, error: verifierError })),
        },
    })),
}));

/** Authed user; auth.updateUser is added (the base mock omits it). */
function authed(email: string | undefined = 'a@b.co') {
    serverClient = mockSupabaseClient({ user: { id: 'user-1', email } });
    (serverClient.auth as Record<string, unknown>).updateUser = vi.fn(async () => ({ data: {}, error: null }));
    return serverClient;
}

beforeEach(() => {
    vi.clearAllMocks();
    verifierError = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

describe('POST /api/account/password', () => {
    it('401 when there is no session', async () => {
        serverClient = mockSupabaseClient({ user: null });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { currentPassword: 'a', newPassword: 'abcdefgh' } }))).status).toBe(401);
    });

    it('401 for an anonymous account with no email', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { currentPassword: 'a', newPassword: 'abcdefgh' } }))).status).toBe(401);
    });

    it('400 when the current password is missing', async () => {
        authed();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { newPassword: 'abcdefgh' } }))).status).toBe(400);
    });

    it('400 when the new password is too short', async () => {
        authed();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { currentPassword: 'old', newPassword: 'short' } }))).status).toBe(400);
    });

    it('400 when the new password equals the current one', async () => {
        authed();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { currentPassword: 'samepass1', newPassword: 'samepass1' } }))).status).toBe(400);
    });

    it('401 when re-auth with the current password fails', async () => {
        authed();
        verifierError = { message: 'bad' };
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { currentPassword: 'wrong', newPassword: 'abcdefgh' } }))).status).toBe(401);
    });

    it('does not rotate the session client when verifying the old password (M11)', async () => {
        authed();
        const { POST } = await import('./route');
        await POST(makeRequest({ method: 'POST', body: { currentPassword: 'oldpass1', newPassword: 'newpass12' } }));
        // Verification happens on the throwaway client, never the cookie-bound one.
        expect(serverClient.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('changes the password on the happy path', async () => {
        authed();
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { currentPassword: 'oldpass1', newPassword: 'newpass12' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });

    it('500 when the password update errors', async () => {
        authed();
        (serverClient.auth as Record<string, unknown>).updateUser = vi.fn(async () => ({ data: {}, error: { message: 'boom' } }));
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { currentPassword: 'oldpass1', newPassword: 'newpass12' } }))).status).toBe(500);
    });
});
