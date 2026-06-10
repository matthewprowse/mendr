/**
 * DOM tests for settings/privacy/client.tsx — PrivacyClient.
 *
 * Pinned behaviours:
 *   - unauthenticated: shows login prompt
 *   - authenticated + initialConsent: renders each consent toggle
 *   - toggling a consent calls PATCH /api/account/data-consent
 *   - "Download Export" button calls GET /api/account/export
 *   - empty shares state shows "no shared specialists" message
 *   - shared specialist list renders with "Revoke" button
 *   - "Revoke" button calls POST /api/account/consents/revoke
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
    usePathname: () => '/settings/privacy',
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

const { default: PrivacyClient } = await import('../client');
import type { ConsentState } from '../client';

const fakeUser = { id: 'u1', email: 'user@example.com' } as unknown as User;

const sampleConsent: ConsentState = {
    product_analytics: true,
    model_training: false,
};

describe('settings/privacy/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.user = null;

        // Set up default handlers for the three fetch calls made by the component
        server.use(
            http.get('/api/account/data-consent', () =>
                HttpResponse.json(sampleConsent, { status: 200 }),
            ),
            http.patch('/api/account/data-consent', async () =>
                HttpResponse.json({ ok: true }, { status: 200 }),
            ),
            http.get('/api/account/consent-settings', () =>
                HttpResponse.json({ mode: 'ask_each_time' }, { status: 200 }),
            ),
            http.get('/api/account/consents', () =>
                HttpResponse.json({ specialists: [] }, { status: 200 }),
            ),
        );
    });

    it('shows login prompt when user is not authenticated', () => {
        authMock.user = null;
        render(<PrivacyClient />);
        expect(screen.getByRole('heading', { name: /privacy/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
            'href',
            '/auth/login?next=/settings/privacy',
        );
    });

    it('renders consent toggles when authenticated with initial consent', () => {
        authMock.user = fakeUser;
        render(<PrivacyClient initialConsent={sampleConsent} />);
        expect(screen.getByLabelText(/product analytics/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/help improve mendr's ai/i)).toBeInTheDocument();
    });

    it('Product Analytics toggle is checked when consent is true', () => {
        authMock.user = fakeUser;
        render(<PrivacyClient initialConsent={sampleConsent} />);
        const toggle = screen.getByLabelText(/product analytics/i);
        expect(toggle).toBeChecked();
    });

    it('Model Training toggle is unchecked when consent is false', () => {
        authMock.user = fakeUser;
        render(<PrivacyClient initialConsent={sampleConsent} />);
        const toggle = screen.getByLabelText(/help improve mendr's ai/i);
        expect(toggle).not.toBeChecked();
    });

    it('toggling consent calls PATCH /api/account/data-consent', async () => {
        authMock.user = fakeUser;
        let patchBody: unknown = null;
        server.use(
            http.patch('/api/account/data-consent', async ({ request }) => {
                patchBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<PrivacyClient initialConsent={sampleConsent} />);

        await user.click(screen.getByLabelText(/product analytics/i));

        await waitFor(() => {
            expect(patchBody).toMatchObject({ product_analytics: false });
        });
    });

    it('"Download Export" button calls GET /api/account/export', async () => {
        authMock.user = fakeUser;

        // Mock the export endpoint to return a blob
        let exportCalled = false;
        server.use(
            http.get('/api/account/export', () => {
                exportCalled = true;
                return new HttpResponse('{"data":"export"}', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }),
        );

        const user = userEvent.setup();
        render(<PrivacyClient initialConsent={sampleConsent} />);

        // Wait for the consent settings and consents to load (they are fetched on mount)
        await waitFor(() => screen.getByLabelText(/product analytics/i));

        await user.click(screen.getByRole('button', { name: /download export/i }));
        await waitFor(() => expect(exportCalled).toBe(true));
    });

    it('shows "no shared specialists" message when shares list is empty', async () => {
        authMock.user = fakeUser;
        render(<PrivacyClient initialConsent={sampleConsent} />);

        // Wait for async fetching of consent-settings and consents
        await waitFor(() =>
            expect(
                screen.getByText(/you have not shared your details with any specialists yet/i),
            ).toBeInTheDocument(),
        );
    });

    it('renders shared specialists with Revoke button', async () => {
        authMock.user = fakeUser;
        server.use(
            http.get('/api/account/consents', () =>
                HttpResponse.json(
                    { specialists: [{ provider_id: 'prov1', name: 'Trusted Plumber' }] },
                    { status: 200 },
                ),
            ),
        );
        render(<PrivacyClient initialConsent={sampleConsent} />);
        await waitFor(() => expect(screen.getByText('Trusted Plumber')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
    });

    it('"Revoke" calls POST /api/account/consents/revoke', async () => {
        authMock.user = fakeUser;
        let revokeBody: unknown = null;
        server.use(
            http.get('/api/account/consents', () =>
                HttpResponse.json(
                    { specialists: [{ provider_id: 'prov1', name: 'Trusted Plumber' }] },
                    { status: 200 },
                ),
            ),
            http.post('/api/account/consents/revoke', async ({ request }) => {
                revokeBody = await request.json();
                return HttpResponse.json({ ok: true }, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<PrivacyClient initialConsent={sampleConsent} />);
        await waitFor(() => screen.getByRole('button', { name: /revoke/i }));
        await user.click(screen.getByRole('button', { name: /revoke/i }));

        await waitFor(() =>
            expect(revokeBody).toMatchObject({ providerId: 'prov1' }),
        );
    });
});
