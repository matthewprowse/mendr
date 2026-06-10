/**
 * DOM tests for auth/reset/client.tsx — ResetPasswordPage.
 *
 * Pinned behaviours:
 *   - renders new password and confirm password fields
 *   - submit button is disabled when fields are empty
 *   - submit button is disabled when passwords don't match
 *   - submit button is disabled when password < 8 chars
 *   - shows "Passwords don't match" message when mismatch occurs
 *   - calls supabase.auth.updateUser with the new password on submit
 *   - shows "Password updated" success state after submit
 *   - "Go to Mendr" link/button present in success state
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const routerPush = vi.fn();
const routerBack = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush, back: routerBack }),
    useSearchParams: () => ({ get: vi.fn(() => null) }),
}));

const supabaseAuth = {
    updateUser: vi.fn(async () => ({ error: null })),
};

vi.mock('@/lib/auth/supabase', () => ({
    supabase: { auth: supabaseAuth },
    getSupabase: () => ({ auth: supabaseAuth }),
}));

// Mock FlowStepHeader which may have dependencies
vi.mock('@/components/flow-header', () => ({
    FlowStepHeader: () => <div data-testid="flow-header" />,
}));

const { default: ResetPasswordPage } = await import('../client');

describe('auth/reset/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders new password and confirm password fields', () => {
        render(<ResetPasswordPage />);
        expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });

    it('submit button is disabled when fields are empty', () => {
        render(<ResetPasswordPage />);
        expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
    });

    it('submit button is disabled when password is fewer than 8 characters', async () => {
        const user = userEvent.setup();
        render(<ResetPasswordPage />);
        await user.type(screen.getByLabelText(/new password/i), 'short1');
        await user.type(screen.getByLabelText(/confirm password/i), 'short1');
        expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
    });

    it('submit button is disabled when passwords do not match', async () => {
        const user = userEvent.setup();
        render(<ResetPasswordPage />);
        await user.type(screen.getByLabelText(/new password/i), 'securepass1');
        await user.type(screen.getByLabelText(/confirm password/i), 'securepass2');
        expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
    });

    it('shows mismatch error message when passwords do not match after confirm is typed', async () => {
        const user = userEvent.setup();
        render(<ResetPasswordPage />);
        await user.type(screen.getByLabelText(/new password/i), 'securepass1');
        await user.type(screen.getByLabelText(/confirm password/i), 'different1');
        expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
    });

    it('submit button is enabled when passwords match and >= 8 chars', async () => {
        const user = userEvent.setup();
        render(<ResetPasswordPage />);
        await user.type(screen.getByLabelText(/new password/i), 'securepassword');
        await user.type(screen.getByLabelText(/confirm password/i), 'securepassword');
        expect(screen.getByRole('button', { name: /update password/i })).toBeEnabled();
    });

    it('calls updateUser with the new password on submit', async () => {
        const user = userEvent.setup();
        render(<ResetPasswordPage />);
        await user.type(screen.getByLabelText(/new password/i), 'mynewpassword');
        await user.type(screen.getByLabelText(/confirm password/i), 'mynewpassword');
        await user.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() =>
            expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ password: 'mynewpassword' }),
        );
    });

    it('shows success state after successful password update', async () => {
        const user = userEvent.setup();
        render(<ResetPasswordPage />);
        await user.type(screen.getByLabelText(/new password/i), 'mynewpassword');
        await user.type(screen.getByLabelText(/confirm password/i), 'mynewpassword');
        await user.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() =>
            expect(screen.getByText(/password updated/i)).toBeInTheDocument(),
        );
    });

    it('"Go to Mendr" button/link is present in success state and navigates to /', async () => {
        const user = userEvent.setup();
        render(<ResetPasswordPage />);
        await user.type(screen.getByLabelText(/new password/i), 'mynewpassword');
        await user.type(screen.getByLabelText(/confirm password/i), 'mynewpassword');
        await user.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() => screen.getByText(/password updated/i));

        const goBtn = screen.getByRole('button', { name: /go to mendr/i });
        await user.click(goBtn);
        expect(routerPush).toHaveBeenCalledWith('/');
    });
});
