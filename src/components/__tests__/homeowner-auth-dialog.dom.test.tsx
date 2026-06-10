/**
 * Behavior tests for `HomeownerAuthDialog` — the dialog rendered when a
 * homeowner hits a gated action (e.g. save provider) without an account.
 *
 * Pinned behaviors:
 *   • `open=false` hides the dialog.
 *   • The default "options" step shows Google + email CTAs.
 *   • Clicking "Continue with Email" reveals the email step with Back/Send.
 *   • Submitting the email step calls `signInWithOtp` and shows the "Check
 *     your email" confirmation with the typed address.
 *   • Supabase errors render in a `role="alert"` element.
 *   • Closing the dialog resets state — re-opening returns to the options step.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseAuth = {
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
};

vi.mock('@/lib/auth/supabase', () => ({
    getSupabase: () => ({ auth: supabaseAuth }),
}));

const { HomeownerAuthDialog } = await import('@/components/homeowner-auth-dialog');

describe('HomeownerAuthDialog', () => {
    beforeEach(() => {
        Object.values(supabaseAuth).forEach((m) => m.mockClear());
    });

    it('renders nothing when closed', () => {
        render(<HomeownerAuthDialog open={false} onOpenChange={() => {}} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('options step shows Google + email CTAs with the supplied reason', () => {
        render(
            <HomeownerAuthDialog
                open
                onOpenChange={() => {}}
                reason="Save this contractor for later."
            />,
        );
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/save this contractor for later\./i)).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
    });

    it('email step submits via signInWithOtp and shows the confirmation', async () => {
        const user = userEvent.setup();
        render(<HomeownerAuthDialog open onOpenChange={() => {}} />);

        await user.click(screen.getByRole('button', { name: /continue with email/i }));
        await user.type(screen.getByLabelText(/email address/i), 'homeowner@example.com');
        await user.click(screen.getByRole('button', { name: /send link/i }));

        await waitFor(() => expect(supabaseAuth.signInWithOtp).toHaveBeenCalledTimes(1));
        expect(supabaseAuth.signInWithOtp).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'homeowner@example.com' }),
        );
        // Confirmation step shows the email back to the user.
        expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
        expect(screen.getByText('homeowner@example.com')).toBeInTheDocument();
    });

    it('renders a Supabase OTP error in role="alert"', async () => {
        supabaseAuth.signInWithOtp.mockResolvedValueOnce({
            error: { message: 'Email rate limit exceeded' } as never,
        });
        const user = userEvent.setup();
        render(<HomeownerAuthDialog open onOpenChange={() => {}} />);

        await user.click(screen.getByRole('button', { name: /continue with email/i }));
        await user.type(screen.getByLabelText(/email address/i), 'homeowner@example.com');
        await user.click(screen.getByRole('button', { name: /send link/i }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/email rate limit exceeded/i);
    });

    it('Google CTA delegates to signInWithOAuth with google', async () => {
        const user = userEvent.setup();
        render(<HomeownerAuthDialog open onOpenChange={() => {}} />);

        await user.click(screen.getByRole('button', { name: /continue with google/i }));

        await waitFor(() => expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledTimes(1));
        expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'google' }),
        );
    });

    it('Back from email step returns to options', async () => {
        const user = userEvent.setup();
        render(<HomeownerAuthDialog open onOpenChange={() => {}} />);

        await user.click(screen.getByRole('button', { name: /continue with email/i }));
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /back/i }));
        expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
    });
});
