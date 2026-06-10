/**
 * Behavior tests for the public Pro profile page (`ContractorClient`).
 *
 * The page hydrates from `useContractor` and composes a stack of section
 * components (identity, about, hours, reviews, gallery, map). We mock the data
 * hooks and the heavy section children so the test asserts ContractorClient's
 * own logic: the error state, the loading skeleton banner, the save-button
 * auth gate, the website/contact footer, and the directions link — not the
 * internals of each section.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractorProfile } from '@/features/match/contracts';

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    back: vi.fn(),
    pathname: '/pro/prov_1',
    searchParams: new URLSearchParams(),
    useAuth: vi.fn(),
    useContractor: vi.fn(),
    useSavedProvider: vi.fn(),
    toggleSave: vi.fn(),
    trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, back: mocks.back, replace: vi.fn() }),
    usePathname: () => mocks.pathname,
    useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/context/auth-context', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('@/lib/analytics/provider-view', () => ({ trackProviderView: vi.fn() }));

vi.mock('@/app/pro/hooks/use-contractor', () => ({ useContractor: mocks.useContractor }));
vi.mock('@/app/pro/hooks/use-saved-provider', () => ({ useSavedProvider: mocks.useSavedProvider }));
vi.mock('@/app/pro/hooks/use-reviews', () => ({
    useProReviews: () => ({
        isReviewsLoading: false,
        resolvedProviderId: 'prov_1',
        providerGooglePlaceId: null,
        googleReviewTotalFromGoogle: 0,
        mendrReviewTotalFromMendr: 0,
        googleReviewCards: [],
        mendrReviewCards: [],
        googleReviewsShown: false,
        mendrReviewsShown: false,
        googleReviewsVisibleCount: 0,
        mendrReviewsVisibleCount: 0,
        setGoogleReviewsVisibleCount: vi.fn(),
        setMendrReviewsVisibleCount: vi.fn(),
        mendrCategoryAggregates: null,
        submitReview: vi.fn(async () => ({ ok: true })),
    }),
}));
vi.mock('@/app/pro/hooks/use-gallery', () => ({
    useProGallery: () => ({
        galleryUploading: false,
        galleryAddOpen: false,
        setGalleryAddOpen: vi.fn(),
        galleryDraftItems: [],
        setGalleryDraftItems: vi.fn(),
        galleryModalError: null,
        setGalleryModalError: vi.fn(),
        galleryModalSuccess: false,
        setGalleryModalSuccess: vi.fn(),
        galleryModalInputRef: { current: null },
        handleGalleryModalFiles: vi.fn(),
        openGalleryAddDialog: vi.fn(),
        isGalleryLoading: false,
        isSyncingGoogleGallery: false,
        galleryGridImages: [],
        galleryImages: [],
        setLightbox: vi.fn(),
        removeGalleryDraftItem: vi.fn(),
        updateGalleryDraftCaption: vi.fn(),
        handleGalleryModalSubmit: vi.fn(),
        lightbox: null,
    }),
}));

// Section children — render minimal probes so we test ContractorClient, not them.
vi.mock('@/app/pro/[id]/components/identity-card', () => ({
    IdentityCard: ({ name }: { name: string }) => <div data-testid="identity">{name}</div>,
}));
vi.mock('@/app/pro/[id]/components/trust-strip', () => ({ TrustStrip: () => <div /> }));
vi.mock('@/app/pro/[id]/components/hours-card', () => ({ HoursCard: () => <div data-testid="hours" /> }));
vi.mock('@/app/pro/[id]/components/reviews-section', () => ({
    ReviewsSection: ({ children }: { children: React.ReactNode }) => <div data-testid="reviews">{children}</div>,
}));
vi.mock('@/app/pro/[id]/components/gallery-section', () => ({
    GallerySection: ({ children }: { children: React.ReactNode }) => <div data-testid="gallery">{children}</div>,
}));
vi.mock('@/app/pro/[id]/components/map', () => ({ ProPageMap: () => <div data-testid="map" /> }));
vi.mock('@/app/pro/components/reviews', () => ({ ProReviewsTab: () => <div data-testid="reviews-tab" /> }));
vi.mock('@/app/pro/components/gallery', () => ({ ProGalleryTab: () => <div data-testid="gallery-tab" /> }));
vi.mock('@/app/match/components/provider-card', () => ({ ProviderCardCarousel: () => <div data-testid="carousel" /> }));
vi.mock('@/components/contact-popover', () => ({
    ContactPopover: ({ label }: { label?: string }) => <button type="button">{label ?? 'Contact'}</button>,
}));
vi.mock('@/components/header-auth', () => ({ HeaderAuth: () => <div data-testid="header-auth" /> }));
vi.mock('@/components/homeowner-auth-dialog', () => ({
    HomeownerAuthDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="auth-dialog" /> : null),
}));

const { default: ContractorClient } = await import('@/app/pro/[id]/components/client');

function profile(overrides: Partial<ContractorProfile> = {}): ContractorProfile {
    return {
        placeId: 'place_1',
        providerId: 'prov_1',
        name: 'Ace Plumbing',
        address: '1 Main Rd, Cape Town',
        rating: 4.5,
        ratingCount: 12,
        latitude: -33.9,
        longitude: 18.4,
        distanceKm: null,
        durationText: '',
        website: 'https://aceplumbing.example',
        phone: '+27210000000',
        summary: 'Reliable plumbers.',
        googlePlaceId: 'gpid_1',
        bio: null,
        about: null,
        pastWork: null,
        summaryLong: null,
        highlights: [],
        serviceAreas: [],
        nextOpensAt: null,
        ...overrides,
    } as ContractorProfile;
}

function setContractor(state: { profile?: ContractorProfile | null; isLoading?: boolean; error?: string | null }) {
    mocks.useContractor.mockReturnValue({
        profile: state.profile ?? null,
        isLoading: state.isLoading ?? false,
        error: state.error ?? null,
        leakDetected: false,
    });
}

function setSaved(state: { saved?: boolean; loading?: boolean } = {}) {
    mocks.useSavedProvider.mockReturnValue({
        saved: state.saved ?? false,
        loading: state.loading ?? false,
        toggle: mocks.toggleSave,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/pro/prov_1';
    mocks.searchParams = new URLSearchParams();
    mocks.useAuth.mockReturnValue({ user: null });
    mocks.toggleSave.mockResolvedValue(true);
    setContractor({ profile: profile() });
    setSaved();
});

describe('ContractorClient', () => {
    it('renders the provider name in the identity card', () => {
        render(<ContractorClient />);
        expect(screen.getByTestId('identity')).toHaveTextContent('Ace Plumbing');
    });

    it('shows the "Pro not found" error state when the hook reports an error', () => {
        setContractor({ error: 'failed' });
        render(<ContractorClient />);
        expect(screen.getByRole('heading', { name: /pro not found/i })).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /go back/i }).length).toBeGreaterThan(0);
    });

    it('renders the website link in the footer when a website is present', () => {
        render(<ContractorClient />);
        const websiteLink = screen.getByRole('link', { name: /website/i });
        expect(websiteLink).toHaveAttribute('href', 'https://aceplumbing.example');
    });

    it('disables the Website button when no website is present', () => {
        setContractor({ profile: profile({ website: null }) });
        render(<ContractorClient />);
        expect(screen.getByRole('button', { name: /website/i })).toBeDisabled();
    });

    it('renders a "Get directions" link built from the address', () => {
        render(<ContractorClient />);
        const directions = screen.getByRole('link', { name: /get directions/i });
        expect(directions).toHaveAttribute(
            'href',
            expect.stringContaining('destination=1%20Main%20Rd%2C%20Cape%20Town'),
        );
    });

    it('opens the auth dialog when an unauthenticated user clicks Save', async () => {
        const user = userEvent.setup();
        render(<ContractorClient />);
        await user.click(screen.getByRole('button', { name: /save pro/i }));
        expect(screen.getByTestId('auth-dialog')).toBeInTheDocument();
        expect(mocks.toggleSave).not.toHaveBeenCalled();
    });

    it('toggles the saved state for an authenticated user', async () => {
        const user = userEvent.setup();
        mocks.useAuth.mockReturnValue({ user: { email: 'a@b.com' } });
        render(<ContractorClient />);
        await user.click(screen.getByRole('button', { name: /save pro/i }));
        await waitFor(() => expect(mocks.toggleSave).toHaveBeenCalled());
        await waitFor(() =>
            expect(mocks.trackEvent).toHaveBeenCalledWith(
                'contractor_save_toggle',
                expect.objectContaining({ saved: true }),
            ),
        );
    });

    it('reflects the saved state via aria-pressed on the save button', () => {
        mocks.useAuth.mockReturnValue({ user: { email: 'a@b.com' } });
        setSaved({ saved: true });
        render(<ContractorClient />);
        expect(screen.getByRole('button', { name: /remove from saved/i })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });

    it('fires a contractor_view analytics event once the profile is present', async () => {
        render(<ContractorClient />);
        await waitFor(() =>
            expect(mocks.trackEvent).toHaveBeenCalledWith(
                'contractor_view',
                expect.objectContaining({ provider_id: 'prov_1' }),
            ),
        );
    });

    it('routes back to the match flow on Back when a conversationId is present', async () => {
        const user = userEvent.setup();
        mocks.searchParams = new URLSearchParams({ conversationId: 'conv9' });
        render(<ContractorClient />);
        await user.click(screen.getAllByRole('button', { name: /go back/i })[0]);
        expect(mocks.push).toHaveBeenCalledWith('/match/conv9');
    });

    it('shows the reviews and gallery sections', () => {
        render(<ContractorClient />);
        expect(screen.getByTestId('reviews')).toBeInTheDocument();
        expect(screen.getByTestId('gallery')).toBeInTheDocument();
    });
});
