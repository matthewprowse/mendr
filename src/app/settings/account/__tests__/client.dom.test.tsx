/**
 * DOM tests for settings/account/client.tsx — AccountClient.
 *
 * Pinned behaviours:
 *   - unauthenticated: shows login prompt
 *   - authenticated + initialProfile: shows profile fields with data
 *   - first name, surname, description fields are editable
 *   - "Save Changes" disabled when form is not dirty
 *   - "Save Changes" enabled when form is dirty; calls PATCH /api/account/profile
 *   - "Change Password" form: validates current password, new >= 8 chars, match
 *   - "Change Password" calls POST /api/account/password on valid input
 *   - "Log Out" calls signOut and navigates to /home
 *   - "Delete Account" opens AlertDialog; action disabled until email confirmed
 *   - "Delete Account" calls POST /api/account/delete when email matches
 */

import { render, screen, waitFor, within } from '@testing-library/react';
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
    usePathname: () => '/settings/account',
}));

const signOutMock = vi.fn(async () => {});
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

// Supabase mock for refreshSession (called after avatar upload)
vi.mock('@/lib/auth/supabase', () => ({
    getSupabase: () => ({
        auth: { refreshSession: vi.fn(async () => ({ data: null, error: null })) },
    }),
    supabase: {
        auth: { refreshSession: vi.fn(async () => ({ data: null, error: null })) },
    },
}));

const { default: AccountClient } = await import('../client');
import type { Profile } from '../client';

const fakeUser = { id: 'u1', email: 'user@example.com' } as unknown as User;

const sampleProfile: Profile = {
    email: 'user@example.com',
    firstName: 'John',
    surname: 'Doe',
    description: 'A homeowner.',
    avatarUrl: null,
};

describe('settings/account/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.user = null;
        authMock.signOut = vi.fn(async () => {});
    });

    it('shows login prompt when user is not authenticated', () => {
        authMock.user = null;
        render(<AccountClient />);
        expect(screen.getByRole('heading', { name: /account/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
            'href',
            '/auth/login?next=/settings/account',
        );
    });

    it('shows profile fields with initial data when authenticated', () => {
        authMock.user = fakeUser;
        render(<AccountClient initialProfile={sampleProfile} />);
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
        expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument();
    });

    it('"Save Changes" button is disabled when form is not dirty', () => {
        authMock.user = fakeUser;
        render(<AccountClient initialProfile={sampleProfile} />);
        expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    });

    it('"Save Changes" button is enabled after modifying first name', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        const firstNameInput = screen.getByLabelText(/first name/i);
        await user.clear(firstNameInput);
        await user.type(firstNameInput, 'Jane');
        expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });

    it('calls PATCH /api/account/profile and shows success toast on save', async () => {
        authMock.user = fakeUser;
        let capturedBody: unknown = null;
        server.use(
            http.patch('/api/account/profile', async ({ request }) => {
                capturedBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        const firstNameInput = screen.getByLabelText(/first name/i);
        await user.clear(firstNameInput);
        await user.type(firstNameInput, 'Jane');
        await user.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => {
            expect(capturedBody).toMatchObject({ first_name: 'Jane' });
        });
    });

    it('"Change Password" button is disabled when fields are empty', () => {
        authMock.user = fakeUser;
        render(<AccountClient initialProfile={sampleProfile} />);
        expect(screen.getByRole('button', { name: /change password/i })).toBeDisabled();
    });

    it('"Change Password" button is enabled when all password fields valid', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        await user.type(screen.getByLabelText(/current password/i), 'OldPass123');
        await user.type(screen.getByLabelText(/^new password$/i), 'NewPass456');
        await user.type(screen.getByLabelText(/confirm new password/i), 'NewPass456');
        expect(screen.getByRole('button', { name: /change password/i })).toBeEnabled();
    });

    it('"Change Password" calls POST /api/account/password on valid input', async () => {
        authMock.user = fakeUser;
        let capturedBody: unknown = null;
        server.use(
            http.post('/api/account/password', async ({ request }) => {
                capturedBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        await user.type(screen.getByLabelText(/current password/i), 'OldPass123');
        await user.type(screen.getByLabelText(/^new password$/i), 'NewPass456');
        await user.type(screen.getByLabelText(/confirm new password/i), 'NewPass456');
        await user.click(screen.getByRole('button', { name: /change password/i }));

        await waitFor(() => {
            expect(capturedBody).toMatchObject({
                currentPassword: 'OldPass123',
                newPassword: 'NewPass456',
            });
        });
    });

    it('"Log Out" calls signOut and navigates to /home', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        await user.click(screen.getByRole('button', { name: /log out/i }));
        await waitFor(() => expect(authMock.signOut).toHaveBeenCalledTimes(1));
        expect(routerPush).toHaveBeenCalledWith('/home');
    });

    it('"Delete Account" dialog opens when trigger clicked', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        await user.click(screen.getByRole('button', { name: /delete account/i }));
        // The dialog should appear
        await waitFor(() =>
            expect(screen.getByRole('alertdialog')).toBeInTheDocument(),
        );
    });

    it('"Delete Account" confirm action is disabled until email matches', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        await user.click(screen.getByRole('button', { name: /delete account/i }));
        await waitFor(() => screen.getByRole('alertdialog'));
        const dialog = screen.getByRole('alertdialog');
        // The confirm button inside the dialog should be disabled
        const confirmBtn = within(dialog).getByRole('button', { name: /delete account/i });
        expect(confirmBtn).toBeDisabled();
    });

    it('"Delete Account" action enabled when correct email typed', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        await user.click(screen.getByRole('button', { name: /delete account/i }));
        await waitFor(() => screen.getByRole('alertdialog'));
        const dialog = screen.getByRole('alertdialog');
        const emailInput = within(dialog).getByLabelText(/email address/i);
        await user.type(emailInput, 'user@example.com');
        const confirmBtn = within(dialog).getByRole('button', { name: /delete account/i });
        expect(confirmBtn).toBeEnabled();
    });

    it('"Delete Account" calls POST /api/account/delete on confirm', async () => {
        authMock.user = fakeUser;
        let capturedBody: unknown = null;
        server.use(
            http.post('/api/account/delete', async ({ request }) => {
                capturedBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<AccountClient initialProfile={sampleProfile} />);
        await user.click(screen.getByRole('button', { name: /delete account/i }));
        await waitFor(() => screen.getByRole('alertdialog'));
        const dialog = screen.getByRole('alertdialog');
        const emailInput = within(dialog).getByLabelText(/email address/i);
        await user.type(emailInput, 'user@example.com');
        const confirmBtn = within(dialog).getByRole('button', { name: /delete account/i });
        await user.click(confirmBtn);

        await waitFor(() =>
            expect(capturedBody).toMatchObject({ confirmEmail: 'user@example.com' }),
        );
    });
});
