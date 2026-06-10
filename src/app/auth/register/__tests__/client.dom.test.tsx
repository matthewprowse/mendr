/**
 * DOM tests for auth/register/client.tsx — AuthRegisterForm wrapper.
 *
 * Pinned behaviours:
 *   - all registration fields are present (first name, surname, email, password)
 *   - submit disabled until all fields provided and password >= 8 chars
 *   - submit calls supabase.auth.signUp with correct metadata
 *   - on success: shows "Check Your Inbox" / "Check your email" confirmation
 *   - on failure: shows error message
 *   - "Login" link is present
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
    signUp: vi.fn(async () => ({ error: null, data: {} })),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
};

vi.mock('@/lib/auth/supabase', () => ({
    supabase: { auth: supabaseAuth },
    getSupabase: () => ({ auth: supabaseAuth }),
}));

const { default: RegisterClient } = await import('../client');

describe('auth/register/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        searchParamsGet.mockReturnValue(null);
    });

    it('renders all registration fields', () => {
        render(<RegisterClient />);
        expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/surname/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    });

    it('submit button is disabled when fields are empty', () => {
        render(<RegisterClient />);
        expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
    });

    it('submit button is disabled when password is fewer than 8 characters', async () => {
        const user = userEvent.setup();
        render(<RegisterClient />);
        await user.type(screen.getByLabelText(/first name/i), 'John');
        await user.type(screen.getByLabelText(/surname/i), 'Doe');
        await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'short1');
        expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
    });

    it('submit button is enabled when all fields are valid', async () => {
        const user = userEvent.setup();
        render(<RegisterClient />);
        await user.type(screen.getByLabelText(/first name/i), 'John');
        await user.type(screen.getByLabelText(/surname/i), 'Doe');
        await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'securepassword');
        expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
    });

    it('calls signUp with the correct metadata on submit', async () => {
        const user = userEvent.setup();
        render(<RegisterClient />);
        await user.type(screen.getByLabelText(/first name/i), 'John');
        await user.type(screen.getByLabelText(/surname/i), 'Doe');
        await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'securepassword');
        await user.click(screen.getByRole('button', { name: /create account/i }));

        await waitFor(() =>
            expect(supabaseAuth.signUp).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'john@example.com',
                    password: 'securepassword',
                    options: expect.objectContaining({
                        data: expect.objectContaining({
                            first_name: 'John',
                            surname: 'Doe',
                        }),
                    }),
                }),
            ),
        );
    });

    it('shows confirmation state after successful registration', async () => {
        const user = userEvent.setup();
        render(<RegisterClient />);
        await user.type(screen.getByLabelText(/first name/i), 'John');
        await user.type(screen.getByLabelText(/surname/i), 'Doe');
        await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'securepassword');
        await user.click(screen.getByRole('button', { name: /create account/i }));

        await waitFor(() =>
            expect(screen.getByText(/check your inbox/i)).toBeInTheDocument(),
        );
    });

    it('shows error message on registration failure', async () => {
        supabaseAuth.signUp.mockResolvedValueOnce({
            error: { message: 'Email already registered' },
            data: {},
        } as never);
        const user = userEvent.setup();
        render(<RegisterClient />);
        await user.type(screen.getByLabelText(/first name/i), 'John');
        await user.type(screen.getByLabelText(/surname/i), 'Doe');
        await user.type(screen.getByLabelText(/email address/i), 'existing@example.com');
        await user.type(screen.getByLabelText(/^password$/i), 'securepassword');
        await user.click(screen.getByRole('button', { name: /create account/i }));

        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Email already registered'),
        );
        // Should NOT show confirmation
        expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
    });

    it('"Login" link is visible', () => {
        render(<RegisterClient />);
        expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
    });
});
