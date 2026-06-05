import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthPromptDialog } from '@/components/auth-prompt-dialog';

const supa = vi.hoisted(() => ({
    signInWithOtp: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
}));
vi.mock('@/lib/auth/supabase', () => ({ supabase: { auth: supa } }));

beforeEach(() => {
    vi.clearAllMocks();
    supa.signInWithOtp.mockResolvedValue({ error: null });
});

describe('AuthPromptDialog', () => {
    it('shows the prompt step with the reason', () => {
        render(<AuthPromptDialog open onOpenChange={vi.fn()} reason="Sign in to save this." />);
        expect(screen.getByRole('heading', { name: /login or register to continue/i })).toBeInTheDocument();
        expect(screen.getByText('Sign in to save this.')).toBeInTheDocument();
    });

    it('advances to the email step', async () => {
        const user = userEvent.setup();
        render(<AuthPromptDialog open onOpenChange={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: /continue with email/i }));
        expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    });

    it('sends a magic link and shows the sent confirmation', async () => {
        const user = userEvent.setup();
        render(<AuthPromptDialog open onOpenChange={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: /continue with email/i }));
        await user.type(screen.getByLabelText(/email address/i), 'me@x.co');
        await user.click(screen.getByRole('button', { name: /send link/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument());
        expect(supa.signInWithOtp).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'me@x.co' }),
        );
    });

    it('surfaces a sign-in error and stays on the email step', async () => {
        supa.signInWithOtp.mockResolvedValueOnce({ error: { message: 'Rate limited.' } });
        const user = userEvent.setup();
        render(<AuthPromptDialog open onOpenChange={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: /continue with email/i }));
        await user.type(screen.getByLabelText(/email address/i), 'me@x.co');
        await user.click(screen.getByRole('button', { name: /send link/i }));
        expect(await screen.findByText('Rate limited.')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /check your email/i })).not.toBeInTheDocument();
    });

    it('calls onOpenChange when Maybe Later is clicked', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();
        render(<AuthPromptDialog open onOpenChange={onOpenChange} />);
        await user.click(screen.getByRole('button', { name: /maybe later/i }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
