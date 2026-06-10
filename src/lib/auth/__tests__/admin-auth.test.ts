import { describe, it, expect, beforeEach, vi } from 'vitest';

// requireAdmin authorizes via profiles.is_admin (admin-access.isAdminUser).
// The legacy ADMIN_PASSWORD HMAC cookie path was removed (finding M5).
const { isAdminUserMock } = vi.hoisted(() => ({ isAdminUserMock: vi.fn() }));
vi.mock('../admin-access', () => ({
    isAdminUser: () => isAdminUserMock(),
}));

function makeReq() {
    return { cookies: { get: () => undefined } } as never;
}

describe('admin-auth requireAdmin', () => {
    beforeEach(() => {
        isAdminUserMock.mockReset();
    });

    it('returns null when the user is an admin', async () => {
        isAdminUserMock.mockResolvedValue(true);
        const { requireAdmin } = await import('../admin-auth');
        expect(await requireAdmin(makeReq())).toBeNull();
    });

    it('returns a 401 NextResponse when the user is not an admin', async () => {
        isAdminUserMock.mockResolvedValue(false);
        const { requireAdmin } = await import('../admin-auth');
        const result = await requireAdmin(makeReq());
        expect(result).not.toBeNull();
        expect(result?.status).toBe(401);
    });
});
