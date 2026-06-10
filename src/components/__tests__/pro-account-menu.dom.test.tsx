/**
 * Behavior tests for `ProAccountMenu` — the avatar dropdown in the Pro portal
 * header.
 *
 * Pinned behaviors:
 *   - Returns null (renders nothing) when there is no signed-in user.
 *   - Renders an avatar trigger button when a user is present.
 *   - Shows initials derived from first_name + surname.
 *   - Falls back to email initial when name fields are absent.
 *   - Falls back to first_name initial when surname is absent.
 *   - Clicking the trigger opens the dropdown with Account, Reviews, Service Area links.
 *   - Sign-out option calls signOut and navigates to "/".
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

const { ProAccountMenu } = await import('@/components/pro-account-menu');

function makeUser(meta: Record<string, string | undefined> = {}, email = 'pro@example.com'): User {
    return {
        id: 'u1',
        email,
        app_metadata: {},
        user_metadata: meta,
        aud: 'authenticated',
        created_at: '',
    } as User;
}

describe('ProAccountMenu', () => {
    beforeEach(() => {
        mockUser = null;
        signOutMock.mockReset();
        pushMock.mockReset();
    });

    it('renders nothing when user is null', () => {
        const { container } = render(<ProAccountMenu />);
        expect(container.firstChild).toBeNull();
    });

    it('renders the account menu button when a user is signed in', () => {
        mockUser = makeUser({ first_name: 'John', surname: 'Smith' });
        render(<ProAccountMenu />);
        expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
    });

    it('shows initials JS for first_name=John, surname=Smith', () => {
        mockUser = makeUser({ first_name: 'John', surname: 'Smith' });
        render(<ProAccountMenu />);
        expect(screen.getByText('JS')).toBeInTheDocument();
    });

    it('shows first-name initial only when surname is absent', () => {
        mockUser = makeUser({ first_name: 'Alice' });
        render(<ProAccountMenu />);
        expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('shows email initial when name fields are absent', () => {
        mockUser = makeUser({}, 'zara@example.com');
        render(<ProAccountMenu />);
        expect(screen.getByText('Z')).toBeInTheDocument();
    });

    it('shows "?" when no name and no email', () => {
        mockUser = makeUser({}, '');
        // Override email on the user object
        if (mockUser) mockUser.email = undefined;
        render(<ProAccountMenu />);
        expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('clicking the trigger opens the dropdown with all links', async () => {
        const user = userEvent.setup();
        mockUser = makeUser({ first_name: 'John', surname: 'Smith' });
        render(<ProAccountMenu />);
        await user.click(screen.getByRole('button', { name: /account menu/i }));
        await waitFor(() => {
            expect(screen.getByRole('menuitem', { name: /account/i })).toBeInTheDocument();
        });
        expect(screen.getByRole('menuitem', { name: /reviews/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /service area/i })).toBeInTheDocument();
    });

    it('clicking "Log Out" calls signOut and navigates to "/"', async () => {
        const user = userEvent.setup();
        mockUser = makeUser({ first_name: 'John', surname: 'Smith' });
        render(<ProAccountMenu />);
        await user.click(screen.getByRole('button', { name: /account menu/i }));
        await waitFor(() =>
            expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument(),
        );
        await user.click(screen.getByRole('menuitem', { name: /log out/i }));
        await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
        expect(pushMock).toHaveBeenCalledWith('/');
    });
});
