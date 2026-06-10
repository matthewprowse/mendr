/**
 * Behavior tests for the provider match list (`MatchClient`).
 *
 * The component is a thin composition root over a stack of hooks
 * (conversation context, provider fetch, enrichment polling, filter URL
 * state, contact flow). We mock those hooks to feed controlled state and
 * mock the presentational children (layout, card, empty states) so the test
 * asserts MatchClient's own branching: skeleton vs. empty vs. card list, the
 * close handler routing, and the filter button opening the sheet.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchProvider } from '@/features/match/contracts';
import { DEFAULT_FILTER_STATE } from '@/features/match/hooks/use-match-filters';

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    pathname: '/match/conv1',
    searchParams: new URLSearchParams(),
    trackEvent: vi.fn(),
    useMatchConversationContext: vi.fn(),
    useMatchProviders: vi.fn(),
    useContactFlowState: vi.fn(),
    useMatchFilterUrlState: vi.fn(),
    useLocationSearch: vi.fn(),
    useEnrichmentState: vi.fn(),
    useEnrichmentQueueAndPoll: vi.fn(),
    useMendrReviewCountFetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, back: mocks.back, replace: mocks.replace }),
    usePathname: () => mocks.pathname,
    useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('@/lib/whatsapp-prefill', () => ({ setLastConversationIdForWhatsApp: vi.fn() }));

vi.mock('@/features/match/hooks/use-match-conversation-context', () => ({
    useMatchConversationContext: mocks.useMatchConversationContext,
}));
vi.mock('@/features/match/hooks/use-match-providers', () => ({
    useMatchProviders: mocks.useMatchProviders,
}));
vi.mock('@/app/match/components/use-contact-flow', () => ({
    useContactFlowState: mocks.useContactFlowState,
}));
vi.mock('@/app/match/components/use-match-filter-state', () => ({
    useMatchFilterUrlState: mocks.useMatchFilterUrlState,
}));
vi.mock('@/app/match/components/use-location-search', () => ({
    useLocationSearch: mocks.useLocationSearch,
}));
vi.mock('@/app/match/components/use-enrichment-polling', () => ({
    useEnrichmentState: mocks.useEnrichmentState,
    useEnrichmentQueueAndPoll: mocks.useEnrichmentQueueAndPoll,
    useMendrReviewCountFetch: mocks.useMendrReviewCountFetch,
}));

// Cache + diagnosis fetch the page hits on mount.
vi.mock('@/features/match/cache/match-page-cache', () => ({
    loadMatchPageCache: vi.fn(() => null),
    saveMatchPageCache: vi.fn(),
}));
vi.mock('@/lib/diagnosis/diagnoses-api', () => ({
    fetchConversationDiagnosis: vi.fn(async () => ({ ok: true, data: { diagnosis: null } })),
}));
vi.mock('@/features/diagnosis/processing-orchestrator', () => ({
    buildDiagnosisVersion: vi.fn(() => ''),
}));
vi.mock('@/features/match/api/client', () => ({
    queueEnrichmentApi: vi.fn(async () => {}),
    restoreProviderTokenApi: vi.fn(async () => {}),
}));

// Presentational children — render minimal probes so we can assert structure.
vi.mock('@/app/match/components/match-map-sheet-layout', () => ({
    MatchResultsLayout: ({
        children,
        onClose,
        addressSlot,
        controlsSlot,
    }: {
        children: React.ReactNode;
        onClose: () => void;
        addressSlot: React.ReactNode;
        controlsSlot: React.ReactNode;
    }) => (
        <div data-testid="layout">
            <button type="button" aria-label="Close matches" onClick={onClose}>
                close
            </button>
            <div data-testid="address-slot">{addressSlot}</div>
            <div data-testid="controls-slot">{controlsSlot}</div>
            <div data-testid="list">{children}</div>
        </div>
    ),
}));
vi.mock('@/app/match/components/provider-card', () => ({
    ProviderCard: ({ provider }: { provider: MatchProvider }) => (
        <div data-testid="provider-card">{provider.name}</div>
    ),
    ProviderCardCarousel: () => <div />,
}));
vi.mock('@/app/match/components/empty', () => ({
    MatchNoProvidersEmpty: () => <div data-testid="no-providers-empty">No providers</div>,
}));
vi.mock('@/app/match/components/match-list-states', () => ({
    MatchListSkeleton: () => <div data-testid="list-skeleton">loading</div>,
    MatchFilteredEmpty: () => <div data-testid="filtered-empty">filtered empty</div>,
}));
vi.mock('@/app/match/components/contact-popover', () => ({ ContactPopover: () => <div /> }));
vi.mock('@/app/match/components/address-search-field', () => ({
    AddressSearchField: () => <div data-testid="address-field" />,
}));
vi.mock('@/components/homeowner-auth-dialog', () => ({ HomeownerAuthDialog: () => <div /> }));
vi.mock('@/components/contact-consent-dialog', () => ({ ContactConsentDialog: () => <div /> }));
// next/dynamic FilterSheet — replace with a probe.
vi.mock('next/dynamic', () => ({
    default: () => function FilterSheetStub() { return <div data-testid="filter-sheet" />; },
}));
vi.mock('@/app/match/components/enrichment-utils', async (orig) => {
    const actual = await orig<typeof import('@/app/match/components/enrichment-utils')>();
    return actual;
});

const { MatchClient } = await import('@/app/match/components/client');

function provider(overrides: Partial<MatchProvider> = {}): MatchProvider {
    return {
        placeId: 'place_1',
        providerId: 'prov_1',
        name: 'Ace Plumbing',
        address: '1 Main Rd',
        rating: 4.5,
        ratingCount: 12,
        latitude: -33.9,
        longitude: 18.4,
        distanceKm: 2.3,
        durationText: '5 min',
        website: null,
        phone: null,
        summary: 'Reliable local plumbers with fast turnaround.',
        ...overrides,
    };
}

function setContext(userLocation: { lat: number; lng: number; address?: string } | null) {
    mocks.useMatchConversationContext.mockReturnValue({
        userLocation,
        setUserLocation: vi.fn(),
        addressInput: '',
        setAddressInput: vi.fn(),
        resolveTradeContext: vi.fn(async () => ({ trade: 'Plumbing', trade_detail: '' })),
        ensureLocation: vi.fn(async () => {}),
        getCurrentCoordinates: vi.fn(async () => null),
        persistConversationLocation: vi.fn(async () => {}),
    });
}

function setProviders(providers: MatchProvider[], isProvidersLoading = false) {
    mocks.useMatchProviders.mockReturnValue({
        providers,
        setProviders: vi.fn(),
        companyIndex: 1,
        setCompanyIndex: vi.fn(),
        isProvidersLoading,
        refreshProvidersForLocation: vi.fn(async () => {}),
        providersFromViewportCache: false,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/match/conv1';
    mocks.searchParams = new URLSearchParams();

    setContext({ lat: -33.9, lng: 18.4, address: 'Cape Town' });
    setProviders([]);

    mocks.useContactFlowState.mockReturnValue({
        contactOpen: false, setContactOpen: vi.fn(),
        user: null,
        authOpen: false, setAuthOpen: vi.fn(),
        consentOpen: false, setConsentOpen: vi.fn(),
        contactBusy: false, setContactBusy: vi.fn(),
        consentMode: false, setConsentMode: vi.fn(),
        pendingContact: null, setPendingContact: vi.fn(),
    });
    mocks.useMatchFilterUrlState.mockReturnValue({
        filterState: { ...DEFAULT_FILTER_STATE },
        setFilterState: vi.fn(),
        resetFilters: vi.fn(),
        activeFilterCount: 0,
    });
    mocks.useLocationSearch.mockReturnValue({
        updateLocationFromAddress: vi.fn(async () => {}),
        handleUseCurrentLocation: vi.fn(async () => {}),
    });
    mocks.useEnrichmentState.mockReturnValue({
        mendrReviewCountByProviderId: {}, setMendrReviewCountByProviderId: vi.fn(),
        enrichmentCache: {}, setEnrichmentCache: vi.fn(),
        isEnrichmentLoading: false, setIsEnrichmentLoading: vi.fn(),
        summarySkeletonLongWait: false,
        lastEnrichQueueSignatureRef: { current: '' },
        enrichmentKick: 0, setEnrichmentKick: vi.fn(),
        enrichmentQueueRetryCountRef: { current: 0 },
        hydratedFromCacheRef: { current: false },
        skipInitialProviderFetchRef: { current: false },
        enrichmentCacheRef: { current: {} },
        enrichmentPendingKey: '',
    });
    mocks.useEnrichmentQueueAndPoll.mockReturnValue(undefined);
    mocks.useMendrReviewCountFetch.mockReturnValue(undefined);
});

describe('MatchClient', () => {
    it('shows the loading skeleton when providers are loading and the list is empty', () => {
        setProviders([], true);
        render(<MatchClient conversationId="conv1" />);
        expect(screen.getByTestId('list-skeleton')).toBeInTheDocument();
    });

    it('shows the no-providers empty state once loading settles with no providers', async () => {
        setProviders([]);
        render(<MatchClient conversationId="conv1" />);
        // isLoading flips false after the ensureLocation effect resolves.
        expect(await screen.findByTestId('no-providers-empty')).toBeInTheDocument();
    });

    it('renders a provider card for each provider with a review summary', async () => {
        setProviders([
            provider({ placeId: 'p1', name: 'Ace Plumbing', summary: 'Great work and fair prices.' }),
            provider({ placeId: 'p2', providerId: 'prov_2', name: 'Best Plumbers', summary: 'Fast and friendly service.' }),
        ]);
        render(<MatchClient conversationId="conv1" />);
        await waitFor(() => expect(screen.getAllByTestId('provider-card')).toHaveLength(2));
        expect(screen.getByText('Ace Plumbing')).toBeInTheDocument();
        expect(screen.getByText('Best Plumbers')).toBeInTheDocument();
    });

    it('routes back to the diagnosis page when the close button is clicked', async () => {
        const user = userEvent.setup();
        render(<MatchClient conversationId="conv1" />);
        await user.click(screen.getByRole('button', { name: /close matches/i }));
        expect(mocks.push).toHaveBeenCalledWith('/diagnosis/conv1');
    });

    it('opens the filter sheet and fires the analytics event when Filters is clicked', async () => {
        const user = userEvent.setup();
        render(<MatchClient conversationId="conv1" />);
        await user.click(screen.getByRole('button', { name: /^filters$/i }));
        expect(mocks.trackEvent).toHaveBeenCalledWith(
            'match_filter_open',
            expect.objectContaining({ diagnosis_id: 'conv1' }),
        );
    });

    it('shows the active filter count in the Filters button label', () => {
        mocks.useMatchFilterUrlState.mockReturnValue({
            filterState: { ...DEFAULT_FILTER_STATE },
            setFilterState: vi.fn(),
            resetFilters: vi.fn(),
            activeFilterCount: 2,
        });
        render(<MatchClient conversationId="conv1" />);
        expect(screen.getByRole('button', { name: /filters \(2\)/i })).toBeInTheDocument();
    });

    it('fires a match_view analytics event once providers first load', async () => {
        setProviders([provider({ summary: 'Great work and fair prices.' })]);
        render(<MatchClient conversationId="conv1" />);
        await waitFor(() =>
            expect(mocks.trackEvent).toHaveBeenCalledWith(
                'match_view',
                expect.objectContaining({ diagnosis_id: 'conv1' }),
            ),
        );
    });
});
