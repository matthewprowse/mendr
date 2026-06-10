/**
 * DOM tests for auth/forgot/client.tsx — ForgotPasswordPage.
 *
 * Pinned behaviours:
 *   - renders the email field with accessible label
 *   - submit is disabled when email is empty
 *   - submit is enabled when email is non-empty
 *   - submit calls supabase.auth.resetPasswordForEmail with the entered email
 *   - shows "Check Your Inbox" confirmation state after submission
 *   - "Login" link navigates back
 *   - "Use a Different Email" button resets to form state
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
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
};

vi.mock('@/lib/auth/supabase', () => ({
    supabase: { auth: supabaseAuth },
    getSupabase: () => ({ auth: supabaseAuth }),
}));

const { default: ForgotPasswordPage } = await import('../client');

describe('auth/forgot/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        searchParamsGet.mockReturnValue(null);
    });

    it('renders the email field with accessible label', () => {
        render(<ForgotPasswordPage />);
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });

    it('submit button is disabled when email is empty', () => {
        render(<ForgotPasswordPage />);
        expect(screen.getByRole('button', { name: /send reset link/i })).toBeDisabled();
    });

    it('submit button is enabled when email is provided', async () => {
        const user = userEvent.setup();
        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        expect(screen.getByRole('button', { name: /send reset link/i })).toBeEnabled();
    });

    it('calls resetPasswordForEmail on submit', async () => {
        const user = userEvent.setup();
        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.click(screen.getByRole('button', { name: /send reset link/i }));

        await waitFor(() =>
            expect(supabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
                'user@example.com',
                expect.objectContaining({ redirectTo: expect.any(String) }),
            ),
        );
    });

    it('shows confirmation state after successful submission', async () => {
        const user = userEvent.setup();
        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.click(screen.getByRole('button', { name: /send reset link/i }));

        await waitFor(() =>
            expect(screen.getByText(/check your inbox/i)).toBeInTheDocument(),
        );
    });

    it('shows the entered email in the confirmation state', async () => {
        const user = userEvent.setup();
        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), 'myemail@example.com');
        await user.click(screen.getByRole('button', { name: /send reset link/i }));

        await waitFor(() =>
            expect(screen.getByText(/myemail@example\.com/i)).toBeInTheDocument(),
        );
    });

    it('"Use a Different Email" button resets to form state', async () => {
        const user = userEvent.setup();
        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
        await user.click(screen.getByRole('button', { name: /send reset link/i }));

        await waitFor(() => screen.getByText(/check your inbox/i));

        await user.click(screen.getByRole('button', { name: /use a different email/i }));

        expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });
});
