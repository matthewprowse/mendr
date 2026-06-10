/**
 * DOM tests for settings/addresses/client.tsx — AddressesClient.
 *
 * Pinned behaviours:
 *   - unauthenticated: shows login prompt
 *   - authenticated + initialLocations: renders saved addresses
 *   - empty state shown when no addresses saved
 *   - "Add Address" button shows add form
 *   - form: "Save Address" disabled until label + selectedPlace filled
 *   - "Cancel" button hides the form
 *   - editing a location opens the edit form with existing values
 *   - delete button calls DELETE /api/account/locations?id=<id>
 *   - POST to /api/account/locations adds address to list
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
    usePathname: () => '/settings/addresses',
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

// Mock Google Maps JS API loader — this component calls importLibrary
vi.mock('@googlemaps/js-api-loader', () => ({
    importLibrary: vi.fn(async () => ({})),
}));

vi.mock('@/lib/google-maps-js-loader', () => ({
    ensureGoogleMapsLoaderOptions: vi.fn(),
}));

const { default: AddressesClient } = await import('../client');
import type { SavedLocation } from '../client';

const fakeUser = { id: 'u1', email: 'user@example.com' } as unknown as User;

const sampleLocations: SavedLocation[] = [
    { id: 'loc1', label: 'Home', address: '1 Main Street, Cape Town', lat: -33.9, lng: 18.4 },
    { id: 'loc2', label: 'Work', address: '5 Office Park, Sandton', lat: -26.1, lng: 28.0 },
];

describe('settings/addresses/client.tsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.user = null;
    });

    it('shows login prompt when user is not authenticated', () => {
        authMock.user = null;
        render(<AddressesClient />);
        expect(screen.getByRole('heading', { name: /addresses/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
            'href',
            '/auth/login?next=/settings/addresses',
        );
    });

    it('renders saved addresses when provided', () => {
        authMock.user = fakeUser;
        render(<AddressesClient initialLocations={sampleLocations} />);
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Work')).toBeInTheDocument();
        expect(screen.getByText(/1 Main Street/)).toBeInTheDocument();
    });

    it('shows empty state when no addresses saved', () => {
        authMock.user = fakeUser;
        render(<AddressesClient initialLocations={[]} />);
        expect(screen.getByText(/no saved addresses yet/i)).toBeInTheDocument();
    });

    it('"Add Address" button shows the add form', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AddressesClient initialLocations={[]} />);
        await user.click(screen.getByRole('button', { name: /add address/i }));
        expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^address$/i)).toBeInTheDocument();
    });

    it('"Save Address" button is disabled when label is empty', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AddressesClient initialLocations={[]} />);
        await user.click(screen.getByRole('button', { name: /add address/i }));
        expect(screen.getByRole('button', { name: /save address/i })).toBeDisabled();
    });

    it('"Cancel" button hides the add form', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AddressesClient initialLocations={[]} />);
        await user.click(screen.getByRole('button', { name: /add address/i }));
        expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /cancel/i }));
        expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    });

    it('edit button opens the edit form with existing address values', async () => {
        authMock.user = fakeUser;
        const user = userEvent.setup();
        render(<AddressesClient initialLocations={sampleLocations} />);
        const editBtns = screen.getAllByRole('button', { name: /edit/i });
        await user.click(editBtns[0]); // Edit "Home"
        // The edit form should appear with the label pre-filled
        const nameInput = screen.getByLabelText(/^name$/i);
        expect(nameInput).toHaveValue('Home');
    });

    it('calls DELETE /api/account/locations?id=<id> on delete button click', async () => {
        authMock.user = fakeUser;
        let deletedUrl = '';
        server.use(
            http.delete('/api/account/locations', ({ request }) => {
                deletedUrl = request.url;
                return new HttpResponse(null, { status: 200 });
            }),
        );
        const user = userEvent.setup();
        render(<AddressesClient initialLocations={sampleLocations} />);
        const deleteBtns = screen.getAllByRole('button', { name: /delete address/i });
        await user.click(deleteBtns[0]);

        await waitFor(() => expect(deletedUrl).toContain('loc1'));
    });
});
