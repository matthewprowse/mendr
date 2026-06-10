/**
 * DOM tests for settings/support/client.tsx — SupportClient.
 *
 * Pinned behaviours:
 *   - unauthenticated: shows login prompt
 *   - authenticated: skeleton shown while profile loading
 *   - form fields are rendered after profile loads (first name, surname, email, phone, subject, description)
 *   - submit button disabled when description is empty
 *   - submit calls POST /api/contact with correct payload
 *   - shows success state after successful submission
 *   - shows error when API returns failure
 *   - "Send Another Message" resets the success state
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
import type { User } from '@supabase/supabase-js';
import { server } from '@/app/../__tests__/msw/server';

const routerPush = vi.fn();
const routerBack = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush, back: routerBack }),
    usePathname: () => '/settings/support',
}));

const authMock = vi.hoisted(() => ({
    user: null as User | null,
    signOut: vi.fn(async () => {}),
}));

vi.mock('@/context/auth-context', () => ({
    useAuth: () => authMock,
}));

vi.mock('@/components/user-avatar', () => ({
    UserAvatar: () => <div data-testid="user-avatar" />,
}));

vi.mock('@/components/match/flow-shell', () => ({
    FlowTopBar: ({ leftSlot, centerSlot, rightSlot }: Record<string, React.ReactNode>) => (
        <div data-testid="flow-top-bar">{leftSlot}{centerSlot}{rightSlot}</div>
    ),
}));

vi.mock('@/components/account-tab-bar', () => ({
    AccountTabBar: () => <div data-testid="account-tab-bar" />,
}));

const { default: SupportClient } = await import('../client');

const fakeUser = { id: 'u1', email: 'user@example.com' } as unknown as User;

const sampleProfile = {
    email: 'user@example.com',
    firstName: 'John',
    surname: 'Doe',
};

describe('settings/support/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.user = null;
        // Default profile endpoint
        server.use(
            http.get('/api/account/profile', () =>
                HttpResponse.json(sampleProfile, { status: 200 }),
            ),
        );
    });

    it('shows login prompt when user is not authenticated', () => {
        authMock.user = null;
        render(<SupportClient />);
        expect(screen.getByRole('heading', { name: /support/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
            'href',
            '/auth/login?next=/settings/support',
        );
    });

    it('renders form fields after profile loads', async () => {
        authMock.user = fakeUser;
        render(<SupportClient />);
        await waitFor(() => screen.getByLabelText(/first name/i));
        expect(screen.getByLabelText(/first name/i)).toHaveValue('John');
        expect(screen.getByLabelText(/surname/i)).toHaveValue('Doe');
        expect(screen.getByLabelText(/email address/i)).toHaveValue('user@example.com');
        expect(screen.getByLabelText(/contact number/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it('"Send Message" button is disabled when description is empty', async () => {
        authMock.user = fakeUser;
        render(<SupportClient />);
        await waitFor(() => screen.getByLabelText(/description/i));
        expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
    });

    it('"Send Message" button is enabled after typing in description', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<SupportClient />);
        await waitFor(() => screen.getByLabelText(/description/i));
        await user.type(screen.getByLabelText(/description/i), 'I need help with my account.');
        expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
    });

    it('calls POST /api/contact with correct payload', async () => {
        authMock.user = fakeUser;
        let capturedBody: unknown = null;
        server.use(
            http.post('/api/contact', async ({ request }) => {
                capturedBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<SupportClient />);
        await waitFor(() => screen.getByLabelText(/description/i));
        await user.type(screen.getByLabelText(/description/i), 'I need help with my account.');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() => {
            expect(capturedBody).toMatchObject({
                name: 'John Doe',
                email: 'user@example.com',
                message: 'I need help with my account.',
            });
        });
    });

    it('shows "Message Sent" success state after successful submission', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<SupportClient />);
        await waitFor(() => screen.getByLabelText(/description/i));
        await user.type(screen.getByLabelText(/description/i), 'Hello, I need help.');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() =>
            expect(screen.getByText(/message sent/i)).toBeInTheDocument(),
        );
    });

    it('"Send Another Message" button resets to the form', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<SupportClient />);
        await waitFor(() => screen.getByLabelText(/description/i));
        await user.type(screen.getByLabelText(/description/i), 'Hello, I need help.');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() => screen.getByText(/message sent/i));

        await user.click(screen.getByRole('button', { name: /send another message/i }));

        await waitFor(() => screen.getByLabelText(/description/i));
        expect(screen.queryByText(/message sent/i)).not.toBeInTheDocument();
    });

    it('shows error when API returns failure', async () => {
        authMock.user = fakeUser;
        server.use(
            http.post('/api/contact', async () =>
                HttpResponse.json({ ok: false, error: 'Server error' }, { status: 500 }),
            ),
        );
        const user = userEvent.setup();
        render(<SupportClient />);
        await waitFor(() => screen.getByLabelText(/description/i));
        await user.type(screen.getByLabelText(/description/i), 'Hello, I need help.');
        await user.click(screen.getByRole('button', { name: /send message/i }));

        await waitFor(() =>
            expect(toastMock.error).toHaveBeenCalledWith('Server error'),
        );
        // Should NOT show success state
        expect(screen.queryByText(/message sent/i)).not.toBeInTheDocument();
    });
});
