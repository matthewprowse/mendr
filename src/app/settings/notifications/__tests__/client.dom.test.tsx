/**
 * DOM tests for settings/notifications/client.tsx — NotificationsClient.
 *
 * Pinned behaviours:
 *   - unauthenticated: shows login prompt
 *   - authenticated + initialPrefs: renders all notification toggles
 *   - each toggle reflects the current preference value
 *   - toggling a preference calls PATCH /api/account/notification-preferences
 *   - "Unsubscribe" button is visible when prefs are loaded
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { server } from '@/app/../__tests__/msw/server';

const routerPush = vi.fn();
const routerBack = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush, back: routerBack }),
    usePathname: () => '/settings/notifications',
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

const { default: NotificationsClient } = await import('../client');
import type { Prefs } from '../client';

const fakeUser = { id: 'u1', email: 'user@example.com' } as unknown as User;

const samplePrefs: Prefs = {
    followup_enabled: true,
    rating_enabled: true,
    reengagement_enabled: false,
    product_updates_enabled: true,
};

describe('settings/notifications/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.user = null;
        server.use(
            http.patch('/api/account/notification-preferences', async () =>
                HttpResponse.json({ ok: true }, { status: 200 }),
            ),
        );
    });

    it('shows login prompt when user is not authenticated', () => {
        authMock.user = null;
        render(<NotificationsClient />);
        expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
            'href',
            '/auth/login?next=/settings/notifications',
        );
    });

    it('renders all notification preference toggles when authenticated', () => {
        authMock.user = fakeUser;
        render(<NotificationsClient initialPrefs={samplePrefs} />);
        expect(screen.getByLabelText(/follow-up reminders/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/job rating requests/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/re-engagement emails/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/product updates/i)).toBeInTheDocument();
    });

    it('toggles reflect their preference values', () => {
        authMock.user = fakeUser;
        render(<NotificationsClient initialPrefs={samplePrefs} />);
        expect(screen.getByLabelText(/follow-up reminders/i)).toBeChecked();
        expect(screen.getByLabelText(/re-engagement emails/i)).not.toBeChecked();
    });

    it('toggling a preference calls PATCH /api/account/notification-preferences', async () => {
        authMock.user = fakeUser;
        let patchBody: unknown = null;
        server.use(
            http.patch('/api/account/notification-preferences', async ({ request }) => {
                patchBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<NotificationsClient initialPrefs={samplePrefs} />);

        // Toggle "Follow-Up Reminders" (currently true → becomes false)
        await user.click(screen.getByLabelText(/follow-up reminders/i));

        await waitFor(() => {
            expect(patchBody).toMatchObject({ followup_enabled: false });
        });
    });

    it('optimistically updates the toggle state before API resolves', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<NotificationsClient initialPrefs={samplePrefs} />);

        const toggle = screen.getByLabelText(/re-engagement emails/i);
        expect(toggle).not.toBeChecked();

        await user.click(toggle);

        // Optimistic update: should flip immediately
        expect(toggle).toBeChecked();
    });

    it('"Unsubscribe" button is visible when prefs are loaded', () => {
        authMock.user = fakeUser;
        render(<NotificationsClient initialPrefs={samplePrefs} />);
        expect(screen.getByRole('button', { name: /unsubscribe/i })).toBeInTheDocument();
    });
});
