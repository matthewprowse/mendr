/**
 * Tests for `AuthProvider` / `useAuth`.
 *
 * The provider boots a Supabase session (with a 5s timeout race), subscribes to
 * auth-state changes, and gates its children behind a loading spinner. Pinned:
 *   - useAuth throws when used outside a provider
 *   - an initialUser renders children immediately (no spinner, no flash)
 *   - with no initialUser, children appear once getSession resolves
 *   - an onAuthStateChange event updates the exposed user
 *   - signOut writes an audit event then calls supabase signOut
 *   - the auth subscription is torn down on unmount
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInAnonymously: vi.fn(),
    signOut: vi.fn(),
    logMendrEvent: vi.fn(),
    unsubscribe: vi.fn(),
}));

vi.mock('@/lib/auth/supabase', () => ({
    supabase: {
        auth: {
            getSession: mocks.getSession,
            onAuthStateChange: mocks.onAuthStateChange,
            signInAnonymously: mocks.signInAnonymously,
            signOut: mocks.signOut,
        },
    },
}));

vi.mock('@/lib/audit-log', () => ({
    logMendrEvent: mocks.logMendrEvent,
}));

import { AuthProvider, useAuth } from '@/context/auth-context';

const fakeUser = (email: string) => ({ id: 'u1', email }) as unknown as User;

let authStateCb: ((event: string, session: unknown) => void) | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    authStateCb = null;
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.onAuthStateChange.mockImplementation((cb: (e: string, s: unknown) => void) => {
        authStateCb = cb;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.logMendrEvent.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

function Consumer() {
    const { user, isLoading, signOut } = useAuth();
    return (
        <div>
            <span data-testid="loading">{String(isLoading)}</span>
            <span data-testid="email">{user?.email ?? 'anon'}</span>
            <button onClick={() => void signOut()}>sign out</button>
        </div>
    );
}

describe('useAuth', () => {
    it('throws when used outside an AuthProvider', () => {
        // Silence the React error boundary console noise.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<Consumer />)).toThrow(/useAuth must be used within an AuthProvider/);
        spy.mockRestore();
    });
});

describe('AuthProvider', () => {
    it('renders children immediately when an initialUser is provided', async () => {
        render(
            <AuthProvider initialUser={fakeUser('matthew@example.com')}>
                <Consumer />
            </AuthProvider>,
        );
        expect(screen.getByTestId('email')).toHaveTextContent('matthew@example.com');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('shows children after getSession resolves with a session', async () => {
        mocks.getSession.mockResolvedValue({
            data: { session: { user: fakeUser('session@example.com') } },
            error: null,
        });
        render(
            <AuthProvider>
                <Consumer />
            </AuthProvider>,
        );
        await waitFor(() =>
            expect(screen.getByTestId('email')).toHaveTextContent('session@example.com'),
        );
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('updates the exposed user when an auth-state change fires', async () => {
        render(
            <AuthProvider>
                <Consumer />
            </AuthProvider>,
        );
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('email')).toHaveTextContent('anon');

        act(() => {
            authStateCb?.('SIGNED_IN', { user: fakeUser('changed@example.com') });
        });
        await waitFor(() =>
            expect(screen.getByTestId('email')).toHaveTextContent('changed@example.com'),
        );
    });

    it('signOut writes an audit event then calls supabase signOut', async () => {
        const user = userEvent.setup();
        render(
            <AuthProvider initialUser={fakeUser('matthew@example.com')}>
                <Consumer />
            </AuthProvider>,
        );
        await user.click(screen.getByRole('button', { name: /sign out/i }));
        await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
        expect(mocks.logMendrEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ action: 'SIGN_OUT', type: 'AUTH' }),
        );
    });

    it('unsubscribes from auth-state changes on unmount', async () => {
        const { unmount } = render(
            <AuthProvider initialUser={fakeUser('a@b.com')}>
                <Consumer />
            </AuthProvider>,
        );
        unmount();
        expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
