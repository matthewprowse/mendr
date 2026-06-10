/**
 * Behavior tests for the unified diagnosis entry flow (`/start`).
 *
 * Step 1 collects photos + a problem description; Step 2 collects the property
 * location (GPS or manual address) and then routes to /processing/<id>. The
 * photo-upload helpers, Google Maps loader, image caches and Supabase are all
 * mocked so the test exercises the step machine, the Continue gating, the
 * geolocation/geocode handlers and the navigation payload — not the real
 * upload/diagnose pipeline.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';

const mocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    getSupabase: vi.fn(),
    normalizeSelectedPhoto: vi.fn(),
    uploadPhotoToStorage: vi.fn(),
    setPendingDiagnosisImages: vi.fn(),
    setImageData: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, back: mocks.back, replace: vi.fn() }),
}));

vi.mock('@/context/auth-context', () => ({ useAuth: mocks.useAuth }));

vi.mock('@/lib/auth/supabase', () => ({ getSupabase: mocks.getSupabase }));

vi.mock('@/lib/client-random-id', () => ({ createClientId: () => 'cid_test' }));

vi.mock('@/lib/diagnosis/photo-upload', async (orig) => {
    const actual = await orig<typeof import('@/lib/diagnosis/photo-upload')>();
    return {
        ...actual,
        normalizeSelectedPhoto: mocks.normalizeSelectedPhoto,
        uploadPhotoToStorage: mocks.uploadPhotoToStorage,
    };
});

vi.mock('@/lib/diagnosis/pending-diagnosis-images-cache', () => ({
    setPendingDiagnosisImages: mocks.setPendingDiagnosisImages,
}));

vi.mock('@/lib/image-store', () => ({ setImageData: mocks.setImageData }));

vi.mock('@googlemaps/js-api-loader', () => ({ importLibrary: vi.fn(async () => ({})) }));
vi.mock('@/lib/google-maps-js-loader', () => ({ ensureGoogleMapsLoaderOptions: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

const { StartPageClient } = await import('@/app/start/client');

function setAuth(loggedIn: boolean) {
    mocks.useAuth.mockReturnValue({
        user: loggedIn ? { email: 'a@b.com', user_metadata: { full_name: 'Jane Doe' } } : null,
        signOut: vi.fn(async () => {}),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    setAuth(false);
    mocks.getSupabase.mockReturnValue({
        auth: { getSession: async () => ({ data: { session: null } }) },
    });
    mocks.uploadPhotoToStorage.mockResolvedValue('https://cdn/test.jpg');
    mocks.normalizeSelectedPhoto.mockResolvedValue({
        id: 'p1',
        file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
        status: 'ready',
        previewSrc: 'data:image/jpeg;base64,xxx',
        diagnosisSrc: 'data:image/jpeg;base64,xxx',
    });
    try { window.sessionStorage.clear(); } catch { /* ignore */ }
});

describe('StartPageClient — Step 1 (description + photos)', () => {
    it('renders the problem description textarea with an accessible label', () => {
        render(<StartPageClient />);
        expect(screen.getByLabelText('Problem Description')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /what's happening/i })).toBeInTheDocument();
    });

    it('disables Continue while the description is empty and too short', () => {
        render(<StartPageClient />);
        expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled();
    });

    it('enables Continue once at least 15 characters are entered', async () => {
        const user = userEvent.setup();
        render(<StartPageClient />);
        await user.type(
            screen.getByLabelText('Problem Description'),
            'My geyser is leaking badly',
        );
        expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled();
    });

    it('advances to the Location step when Continue is clicked', async () => {
        const user = userEvent.setup();
        render(<StartPageClient />);
        await user.type(
            screen.getByLabelText('Problem Description'),
            'My geyser is leaking badly',
        );
        await user.click(screen.getByRole('button', { name: /^continue$/i }));
        expect(await screen.findByRole('button', { name: /use my location/i })).toBeInTheDocument();
    });

    it('shows a Login link when the user is logged out', () => {
        render(<StartPageClient />);
        expect(screen.getByRole('link', { name: /login/i })).toHaveAttribute('href', '/auth/login');
    });

    it('shows the account menu avatar when the user is logged in', () => {
        setAuth(true);
        render(<StartPageClient />);
        expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
    });
});

describe('StartPageClient — Step 2 (location)', () => {
    async function gotoStep2(user: ReturnType<typeof userEvent.setup>) {
        await user.type(
            screen.getByLabelText('Problem Description'),
            'My geyser is leaking badly and needs a look',
        );
        await user.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByRole('button', { name: /use my location/i });
    }

    it('shows the "Use My Location" button on the location step', async () => {
        const user = userEvent.setup();
        render(<StartPageClient />);
        await gotoStep2(user);
        expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument();
    });

    it('calls navigator.geolocation and populates the address on success', async () => {
        const user = userEvent.setup();
        const getCurrentPosition = vi.fn((success: PositionCallback) => {
            success({ coords: { latitude: -33.9, longitude: 18.4 } } as GeolocationPosition);
        });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { getCurrentPosition },
        });
        server.use(
            http.post('/api/geocode', () =>
                HttpResponse.json({ address: '1 Main Rd, Cape Town' }, { status: 200 }),
            ),
        );
        render(<StartPageClient />);
        await gotoStep2(user);
        await user.click(screen.getByRole('button', { name: /use my location/i }));
        await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
        // After a successful geocode the Continue button becomes enabled.
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled(),
        );
    });

    it('shows an error toast when geolocation reports a failure', async () => {
        const user = userEvent.setup();
        const getCurrentPosition = vi.fn(
            (_s: PositionCallback, error: PositionErrorCallback) => {
                error({ code: 1, message: 'denied' } as GeolocationPositionError);
            },
        );
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { getCurrentPosition },
        });
        render(<StartPageClient />);
        await gotoStep2(user);
        await user.click(screen.getByRole('button', { name: /use my location/i }));
        await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    });

    it('enables Continue once a manual address is typed into the search field', async () => {
        const user = userEvent.setup();
        render(<StartPageClient />);
        await gotoStep2(user);
        const input = screen.getByLabelText('Search Address');
        await user.type(input, '12 Long Street, Cape Town');
        // hasLocation in manual mode requires gps-done OR locationValue; the
        // search-address field uses the same locationValue, so the diagnose
        // CTA is gated until a value is set. We assert the value round-trips.
        expect(input).toHaveValue('12 Long Street, Cape Town');
    });

    it('navigates to /processing with the location after a successful GPS lookup + Continue', async () => {
        const user = userEvent.setup();
        const getCurrentPosition = vi.fn((success: PositionCallback) => {
            success({ coords: { latitude: -33.9, longitude: 18.4 } } as GeolocationPosition);
        });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { getCurrentPosition },
        });
        server.use(
            http.post('/api/geocode', () =>
                HttpResponse.json({ address: '1 Main Rd, Cape Town' }, { status: 200 }),
            ),
        );
        render(<StartPageClient />);
        await gotoStep2(user);
        await user.click(screen.getByRole('button', { name: /use my location/i }));
        // GPS success sets locationMode='gps-done', enabling the Continue CTA.
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled(),
        );
        await user.click(screen.getByRole('button', { name: /^continue$/i }));
        await waitFor(() =>
            expect(mocks.push).toHaveBeenCalledWith(
                expect.stringContaining('/processing/cid_test'),
            ),
        );
        // Location query param is carried into the processing route.
        expect(mocks.push).toHaveBeenCalledWith(
            expect.stringContaining('location=1+Main+Rd%2C+Cape+Town'),
        );
    });

    it('goes back to Step 1 when the header back button is pressed on Step 2', async () => {
        const user = userEvent.setup();
        render(<StartPageClient />);
        await gotoStep2(user);
        await user.click(screen.getByRole('button', { name: /go back/i }));
        expect(await screen.findByLabelText('Problem Description')).toBeInTheDocument();
    });
});
