/**
 * DOM tests for auth/login/client.tsx — AuthLoginForm wrapper.
 *
 * The client component just renders <AuthLoginForm>, so we test the full
 * login flow via that form. Supabase is mocked. useRouter + useSearchParams
 * are mocked via next/navigation.
 *
 * Pinned behaviours:
 *   - email and password fields are present with accessible labels
 *   - submit is disabled when fields are empty or too short
 *   - submit is enabled when email + password (>=6 chars) are provided
 *   - submit calls supabase.auth.signInWithPassword
 *   - on success: navigates to return URL or defaultNext
 *   - on failure: shows error message inline (no navigation)
 *   - "Forgot Password?" link is present
 *   - "Register" link is present
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const routerPush = vi.fn();
const routerBack = vi.fn();
const searchParamsGet = vi.fn((_key: string): string | null => null);

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush, back: routerBack }),
    useSearchParams: () => ({ get: searchParamsGet }),
}));

const supabaseAuth = {
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
};

vi.mock('@/lib/auth/supabase', () => ({
    supabase: { auth: supabaseAuth },
    getSupabase: () => ({ auth: supabaseAuth }),
}));

// Dynamic import AFTER mocks are set up
const { default: LoginClient } = await import('../client');

describe('auth/login/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        searchParamsGet.mockReturnValue(null);
    });

    it('renders email and password fields with accessible labels', () => {
        render(<LoginClient />);
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    });

    it('submit button is disabled when fields are empty', () => {
        render(<LoginClient />);
        expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
    });

    it('submit button is disabled when password is fewer than 6 characters', async () => {
        const user = userEvent.setup();
        render(<LoginClient />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.type(screen.getByLabelText(/^password$/i), '12345');
        expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
    });

    it('submit button is enabled with valid email and password >= 6 chars', async () => {
        const user = userEvent.setup();
        render(<LoginClient />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'secret1');
        expect(screen.getByRole('button', { name: /login/i })).toBeEnabled();
    });

    it('calls signInWithPassword on submit', async () => {
        const user = userEvent.setup();
        render(<LoginClient />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'secret123');
        await user.click(screen.getByRole('button', { name: /login/i }));
        await waitFor(() =>
            expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'user@example.com', password: 'secret123' }),
            ),
        );
    });

    it('navigates to defaultNext "/" on successful login when no next param', async () => {
        const user = userEvent.setup();
        render(<LoginClient />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'secret123');
        await user.click(screen.getByRole('button', { name: /login/i }));
        await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/'));
    });

    it('navigates to the next param URL on successful login', async () => {
        searchParamsGet.mockReturnValue('/home');
        const user = userEvent.setup();
        render(<LoginClient />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'secret123');
        await user.click(screen.getByRole('button', { name: /login/i }));
        await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/home'));
    });

    it('shows error message on login failure without navigating', async () => {
        supabaseAuth.signInWithPassword.mockResolvedValueOnce({
            error: { message: 'Invalid login credentials' } as never,
        });
        const user = userEvent.setup();
        render(<LoginClient />);
        await user.type(screen.getByLabelText(/email address/i), 'wrong@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'wrongpass');
        await user.click(screen.getByRole('button', { name: /login/i }));
        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Invalid login credentials'),
        );
        expect(routerPush).not.toHaveBeenCalled();
    });

    it('"Forgot Password?" link is visible', () => {
        render(<LoginClient />);
        expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
    });

    it('"Register" link is visible', () => {
        render(<LoginClient />);
        expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
    });
});
