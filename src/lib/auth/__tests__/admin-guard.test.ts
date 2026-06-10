import { describe, it, expect, beforeEach, vi } from 'vitest';

// requireAdminPage is the server-component guard: it calls isAdminUser and, when
// the caller is not an admin, redirects to /home via next/navigation. We mock
// both dependencies. next/navigation's redirect throws in real Next.js to halt
// rendering, so we model it as a throwing spy to assert it is reached.

const { isAdminUserMock, redirectMock } = vi.hoisted(() => ({
    isAdminUserMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    }),
}));

vi.mock('../admin-access', () => ({
    isAdminUser: () => isAdminUserMock(),
}));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => redirectMock(path),
}));

describe('requireAdminPage', () => {
    beforeEach(() => {
        isAdminUserMock.mockReset();
        redirectMock.mockClear();
    });

    it('does not redirect when the user is an admin', async () => {
        isAdminUserMock.mockResolvedValue(true);
        const { requireAdminPage } = await import('../admin-guard');
        await expect(requireAdminPage()).resolves.toBeUndefined();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it('redirects to /home when the user is not an admin', async () => {
        isAdminUserMock.mockResolvedValue(false);
        const { requireAdminPage } = await import('../admin-guard');
        await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT:/home');
        expect(redirectMock).toHaveBeenCalledWith('/home');
    });

    it('redirects to /home when the admin check rejects-falsy via a falsy resolve', async () => {
        // isAdminUser swallows its own errors and returns false; the guard sees false.
        isAdminUserMock.mockResolvedValue(false);
        const { requireAdminPage } = await import('../admin-guard');
        await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT:/home');
        expect(redirectMock).toHaveBeenCalledTimes(1);
    });
});
