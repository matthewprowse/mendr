import { describe, it, expect, beforeEach, vi } from 'vitest';

// isAdminUser validates the cookie-bound session (getUser) and then reads
// profiles.is_admin with the service-role client. We mock supabase-server so no
// real Supabase or next/headers context is required.

const { serverClient, adminClient, createServerMock, createAdminMock } = vi.hoisted(() => {
    const server = {
        auth: { getUser: vi.fn() },
    };
    const maybeSingle = vi.fn();
    const admin = {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle })),
            })),
        })),
        __maybeSingle: maybeSingle,
    };
    return {
        serverClient: server,
        adminClient: admin,
        createServerMock: vi.fn(async () => server),
        createAdminMock: vi.fn(async () => admin),
    };
});

vi.mock('../supabase-server', () => ({
    createSupabaseServerClient: () => createServerMock(),
    createSupabaseAdminClient: () => createAdminMock(),
}));

function setUser(user: unknown, error: unknown = null) {
    serverClient.auth.getUser.mockResolvedValue({ data: { user }, error });
}

function setProfile(data: unknown, error: unknown = null) {
    (adminClient as unknown as { __maybeSingle: ReturnType<typeof vi.fn> }).__maybeSingle.mockResolvedValue(
        { data, error }
    );
}

describe('isAdminUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createServerMock.mockResolvedValue(serverClient);
        createAdminMock.mockResolvedValue(adminClient);
    });

    it('returns true when the signed-in user profile has is_admin === true', async () => {
        setUser({ id: 'user-1' });
        setProfile({ is_admin: true });
        const { isAdminUser } = await import('../admin-access');
        expect(await isAdminUser()).toBe(true);
    });

    it('returns false when is_admin is false', async () => {
        setUser({ id: 'user-1' });
        setProfile({ is_admin: false });
        const { isAdminUser } = await import('../admin-access');
        expect(await isAdminUser()).toBe(false);
    });

    it('returns false when is_admin is a non-boolean truthy value (must be strictly true)', async () => {
        setUser({ id: 'user-1' });
        setProfile({ is_admin: 1 as unknown as boolean });
        const { isAdminUser } = await import('../admin-access');
        expect(await isAdminUser()).toBe(false);
    });

    it('returns false when no profile row is found (data is null)', async () => {
        setUser({ id: 'user-1' });
        setProfile(null);
        const { isAdminUser } = await import('../admin-access');
        expect(await isAdminUser()).toBe(false);
    });

    it('returns false when there is no signed-in user', async () => {
        setUser(null);
        const { isAdminUser } = await import('../admin-access');
        expect(await isAdminUser()).toBe(false);
    });

    it('returns false (and does not query the profile) when getUser returns an error', async () => {
        setUser({ id: 'user-1' }, { message: 'invalid jwt' });
        const { isAdminUser } = await import('../admin-access');
        expect(await isAdminUser()).toBe(false);
        expect(adminClient.from).not.toHaveBeenCalled();
    });

    it('returns false instead of throwing when getUser rejects', async () => {
        serverClient.auth.getUser.mockRejectedValue(new Error('network'));
        const { isAdminUser } = await import('../admin-access');
        await expect(isAdminUser()).resolves.toBe(false);
    });

    it('returns false instead of throwing when the server client cannot be created', async () => {
        createServerMock.mockRejectedValue(new Error('no cookie context'));
        const { isAdminUser } = await import('../admin-access');
        await expect(isAdminUser()).resolves.toBe(false);
    });

    it('queries profiles filtered by the authenticated user id', async () => {
        const eq = vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { is_admin: true } }) }));
        const select = vi.fn(() => ({ eq }));
        adminClient.from.mockReturnValue({ select } as never);
        setUser({ id: 'user-42' });
        const { isAdminUser } = await import('../admin-access');
        await isAdminUser();
        expect(adminClient.from).toHaveBeenCalledWith('profiles');
        expect(select).toHaveBeenCalledWith('is_admin');
        expect(eq).toHaveBeenCalledWith('user_id', 'user-42');
    });
});
