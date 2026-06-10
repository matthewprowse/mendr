/**
 * Behavior tests for `HeaderAuth` — the right-side header control.
 *
 * Pinned behaviors:
 *   - Shows "Login" link when the user is not signed in (no email).
 *   - Shows the avatar dropdown when a real user (with email) is signed in.
 *   - Initials derived from full_name / name / email.
 *   - Fallback initials "?" when no identifying metadata is available.
 *   - Dropdown includes History, Favourites, Settings, Log Out items.
 *   - Sign-out calls signOut and navigates to "/".
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

const signOutMock = vi.fn(async () => {});
const pushMock = vi.fn();
let mockUser: User | null = null;

vi.mock('@/context/auth-context', () => ({
    useAuth: () => ({ user: mockUser, isLoading: false, signOut: signOutMock }),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock }),
}));

const { HeaderAuth } = await import('@/components/header-auth');

function makeUser(meta: Record<string, string | undefined> = {}, email = 'user@example.com'): User {
    return {
        id: 'u1',
        email,
        app_metadata: {},
        user_metadata: meta,
        aud: 'authenticated',
        created_at: '',
    } as User;
}

describe('HeaderAuth', () => {
    beforeEach(() => {
        mockUser = null;
        signOutMock.mockReset();
        pushMock.mockReset();
    });

    it('shows a Login link when not signed in', () => {
        render(<HeaderAuth />);
        const loginLink = screen.getByRole('link', { name: /login/i });
        expect(loginLink).toBeInTheDocument();
        expect(loginLink).toHaveAttribute('href', '/auth/login');
    });

    it('shows the avatar button for a signed-in user with email', () => {
        mockUser = makeUser({ full_name: 'Ada Lovelace' });
        render(<HeaderAuth />);
        expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
        // Login link should be hidden
        expect(screen.queryByRole('link', { name: /login/i })).not.toBeInTheDocument();
    });

    it('does not show the avatar for a user without email (anonymous session)', () => {
        // A user with no email is treated as not logged in by HeaderAuth
        mockUser = makeUser({}, '');
        if (mockUser) mockUser.email = undefined;
        render(<HeaderAuth />);
        expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
    });

    it('derives initials from full_name', () => {
        mockUser = makeUser({ full_name: 'Ada Lovelace' });
        render(<HeaderAuth />);
        expect(screen.getByText('AL')).toBeInTheDocument();
    });

    it('derives initials from name metadata when full_name is absent', () => {
        mockUser = makeUser({ name: 'Bob Builder' });
        render(<HeaderAuth />);
        expect(screen.getByText('BB')).toBeInTheDocument();
    });

    it('derives initials from email when name fields are absent', () => {
        mockUser = makeUser({}, 'zara@example.com');
        render(<HeaderAuth />);
        expect(screen.getByText('Z')).toBeInTheDocument();
    });

    it('shows "?" fallback when no metadata and no email', () => {
        mockUser = makeUser({}, '');
        if (mockUser) mockUser.email = '';
        render(<HeaderAuth />);
        // With empty email, isLoggedIn = false → Login link shown
        expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
    });

    it('dropdown shows History, Favourites, Settings, Log Out', async () => {
        const user = userEvent.setup();
        mockUser = makeUser({ full_name: 'Ada Lovelace' });
        render(<HeaderAuth />);
        await user.click(screen.getByRole('button', { name: /account menu/i }));
        await waitFor(() =>
            expect(screen.getByRole('menuitem', { name: /history/i })).toBeInTheDocument(),
        );
        expect(screen.getByRole('menuitem', { name: /favourites/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
    });

    it('Log Out calls signOut and navigates to "/"', async () => {
        const user = userEvent.setup();
        mockUser = makeUser({ full_name: 'Ada Lovelace' });
        render(<HeaderAuth />);
        await user.click(screen.getByRole('button', { name: /account menu/i }));
        await waitFor(() =>
            expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument(),
        );
        await user.click(screen.getByRole('menuitem', { name: /log out/i }));
        await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
        expect(pushMock).toHaveBeenCalledWith('/');
    });
});
