/**
 * Behavior tests for `AuthCard` — the sign-in / sign-up panel used in the
 * dedicated `/auth/sign-in` and `/auth/sign-up` routes.
 *
 * The component talks to Supabase Auth via `getSupabase()` from
 * `@/lib/auth/supabase`. We mock that module so we can:
 *   • observe which auth method was called and with what payload,
 *   • simulate session-or-no-session signup responses,
 *   • simulate Supabase-level error returns.
 *
 * Pinned behaviors:
 *   • Sign-in mode calls `signInWithPassword`.
 *   • Sign-up mode calls `signUp`; if the response has a session, we navigate
 *     via the injected mock router; otherwise we show the confirm-email copy.
 *   • Magic-link toggle hides the password field and switches submission to
 *     `signInWithOtp`.
 *   • Supabase errors render in a `role="alert"` element.
 *   • Google button calls `signInWithOAuth({ provider: 'google' })`.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock }),
}));

// Hoisted Supabase auth method mocks so each `it` block can configure return values.
const supabaseAuth = {
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } }, error: null })),
    signUp: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } }, error: null })),
};

vi.mock('@/lib/auth/supabase', () => ({
    getSupabase: () => ({ auth: supabaseAuth }),
}));

// Import after mocks so the component closes over them.
const { AuthCard } = await import('@/components/auth-card');

describe('AuthCard', () => {
    beforeEach(() => {
        pushMock.mockReset();
        Object.values(supabaseAuth).forEach((m) => m.mockClear());
    });

    it('sign-in submits email + password via signInWithPassword and routes on success', async () => {
        const user = userEvent.setup();
        render(<AuthCard mode="signin" redirectTo="/match" />);

        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        await user.type(screen.getByLabelText(/password/i), 'hunter22');
        await user.click(screen.getByRole('button', { name: /^sign in$/i }));

        await waitFor(() => expect(supabaseAuth.signInWithPassword).toHaveBeenCalledTimes(1));
        expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith({
            email: 'ada@example.com',
            password: 'hunter22',
        });
        expect(pushMock).toHaveBeenCalledWith('/match');
    });

    it('sign-up calls signUp, navigates when a session is returned', async () => {
        const user = userEvent.setup();
        render(<AuthCard mode="signup" />);

        await user.type(screen.getByLabelText(/email/i), 'new@example.com');
        await user.type(screen.getByLabelText(/password/i), 'secret123');
        await user.click(screen.getByRole('button', { name: /create account/i }));

        await waitFor(() => expect(supabaseAuth.signUp).toHaveBeenCalledTimes(1));
        expect(pushMock).toHaveBeenCalledWith('/');
    });

    it('sign-up with no session returns the confirm-email status', async () => {
        supabaseAuth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
        const user = userEvent.setup();
        render(<AuthCard mode="signup" />);

        await user.type(screen.getByLabelText(/email/i), 'pending@example.com');
        await user.type(screen.getByLabelText(/password/i), 'secret123');
        await user.click(screen.getByRole('button', { name: /create account/i }));

        expect(
            await screen.findByText(/check your email to confirm your account/i),
        ).toBeInTheDocument();
        expect(pushMock).not.toHaveBeenCalled();
    });

    it('renders Supabase errors in role="alert"', async () => {
        supabaseAuth.signInWithPassword.mockResolvedValueOnce({
            data: { session: null },
            error: { message: 'Invalid login credentials' } as never,
        });
        const user = userEvent.setup();
        render(<AuthCard mode="signin" />);

        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        await user.type(screen.getByLabelText(/password/i), 'wrong');
        await user.click(screen.getByRole('button', { name: /^sign in$/i }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/invalid login credentials/i);
        expect(pushMock).not.toHaveBeenCalled();
    });

    it('magic-link toggle hides the password field and submits via signInWithOtp', async () => {
        const user = userEvent.setup();
        render(<AuthCard mode="signin" />);

        await user.click(screen.getByRole('button', { name: /sign in without a password/i }));
        expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();

        await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
        await user.click(screen.getByRole('button', { name: /send sign-in link/i }));

        await waitFor(() => expect(supabaseAuth.signInWithOtp).toHaveBeenCalledTimes(1));
        expect(
            await screen.findByText(/check your email — we sent you a sign-in link\./i),
        ).toBeInTheDocument();
    });

    it('Google button delegates to signInWithOAuth with the google provider', async () => {
        const user = userEvent.setup();
        render(<AuthCard mode="signin" />);

        await user.click(screen.getByRole('button', { name: /continue with google/i }));

        await waitFor(() => expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledTimes(1));
        expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'google' }),
        );
    });

    it('blocks email-only submit with a "Please enter your email address." inline error', async () => {
        // HTML5 `required` prevents most browsers from submitting, but the
        // component also has its own guard. Submit programmatically by clicking
        // the button — jsdom may still bypass the required check via form's
        // requestSubmit invocation depending on the input state. We assert the
        // component-level guard fires when email is empty + password present.
        const user = userEvent.setup();
        render(<AuthCard mode="signin" />);

        // Type and then clear the email so React state stays empty but no
        // HTML5 `required` block fires (the field has been touched).
        const email = screen.getByLabelText(/email/i);
        await user.type(email, 'a');
        await user.clear(email);
        await user.type(screen.getByLabelText(/password/i), 'whatever');

        // Submit via the form element to bypass the browser-side `required`
        // attribute, which would otherwise block the click. We dispatch a
        // native submit event so React's onSubmit fires.
        const form = email.closest('form') as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(
            await screen.findByText(/please enter your email address\./i),
        ).toBeInTheDocument();
    });
});
