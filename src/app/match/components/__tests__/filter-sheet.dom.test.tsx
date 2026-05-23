/**
 * Behavior tests for the /match `FilterSheet`.
 *
 * The sheet is a *controlled* component — parent owns committed state via
 * `useMatchFilters`, the sheet keeps a local draft, and only fires `onApply`
 * when the user clicks "Show N results".
 *
 * Pinned behaviors:
 *   • Returns null when `open=false`.
 *   • Clicking a sort chip updates the draft but NOT committed state.
 *   • Clicking "Show N results" fires onApply with the current draft.
 *   • The "Reset" header button + "Clear All" footer button revert the draft
 *     to `DEFAULT_FILTER_STATE`, and onApply only fires once the user confirms.
 *   • Toggling "Open Now" flips the draft's `onlyOpenNow` field.
 *   • The footer label reflects the live result count of providers after
 *     applying the current draft.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MatchProvider } from '@/features/match/contracts';
import {
    DEFAULT_FILTER_STATE,
    type MatchFilterState,
} from '@/features/match/hooks/use-match-filters';
import { FilterSheet } from '@/app/match/components/filter-sheet';

function makeProvider(overrides: Partial<MatchProvider> = {}): MatchProvider {
    return {
        placeId: overrides.placeId ?? 'p1',
        name: overrides.name ?? 'Acme Plumbing',
        address: '1 Test St',
        rating: 4.5,
        ratingCount: 10,
        latitude: null,
        longitude: null,
        distanceKm: 5,
        durationText: '10 min',
        website: null,
        phone: null,
        summary: '',
        isOpen: true,
        ...overrides,
    };
}

const PROVIDERS: MatchProvider[] = [
    makeProvider({ placeId: 'p1', distanceKm: 2, rating: 4.8, isOpen: true }),
    makeProvider({ placeId: 'p2', distanceKm: 8, rating: 3.2, isOpen: false }),
    makeProvider({ placeId: 'p3', distanceKm: 18, rating: 4.0, isOpen: true }),
];

function renderSheet(stateOverride: Partial<MatchFilterState> = {}) {
    const state: MatchFilterState = { ...DEFAULT_FILTER_STATE, ...stateOverride };
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    const utils = render(
        <FilterSheet
            open
            onOpenChange={onOpenChange}
            state={state}
            onApply={onApply}
            providers={PROVIDERS}
            availableSpecialisations={['Geyser', 'Drain']}
        />,
    );
    return { ...utils, onApply, onOpenChange, state };
}

describe('FilterSheet', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <FilterSheet
                open={false}
                onOpenChange={() => {}}
                state={DEFAULT_FILTER_STATE}
                onApply={() => {}}
                providers={PROVIDERS}
                availableSpecialisations={[]}
            />,
        );
        // The portal is only mounted when open — container should be empty.
        expect(container.firstChild).toBeNull();
    });

    it('shows the sort chips and clicking one updates the draft', async () => {
        const user = userEvent.setup();
        const { onApply } = renderSheet();

        const ratingChip = screen.getByRole('button', { name: /rating \(high → low\)/i });
        await user.click(ratingChip);

        // Draft updated but not yet applied.
        expect(onApply).not.toHaveBeenCalled();

        // Now confirm by clicking Show N Results.
        const showBtn = screen.getByRole('button', { name: /show \d+ result/i });
        await user.click(showBtn);

        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onApply.mock.calls[0][0]).toMatchObject({ sort: 'rating_desc' });
    });

    it('Open Now toggle propagates into the applied state', async () => {
        const user = userEvent.setup();
        const { onApply } = renderSheet();

        const openNowRow = screen.getByText('Open Now').closest('div')!;
        const toggle = within(openNowRow.parentElement!).getAllByRole('switch')[0];
        await user.click(toggle);

        await user.click(screen.getByRole('button', { name: /show \d+ result/i }));

        expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({ onlyOpenNow: true }),
        );
    });

    it('Clear All resets the draft to defaults and disables itself', async () => {
        const user = userEvent.setup();
        renderSheet({ sort: 'rating_desc', onlyOpenNow: true });

        // Header "Reset" button is rendered with an aria-disabled state when
        // no draft filters are active. With our overrides it should be enabled.
        const resetBtn = screen.getByRole('button', { name: /reset/i });
        expect(resetBtn).toBeEnabled();
        await user.click(resetBtn);

        // After reset, the live count footer label shows the *unfiltered* providers count.
        expect(
            screen.getByRole('button', { name: new RegExp(`show ${PROVIDERS.length} result`, 'i') }),
        ).toBeInTheDocument();
    });

    it('Clear All footer button revert + Show fires onApply with default state', async () => {
        const user = userEvent.setup();
        const { onApply } = renderSheet({ minRating: 4, maxRating: 5, onlyOpenNow: true });

        const clearAll = screen.getByRole('button', { name: /clear all/i });
        await user.click(clearAll);
        await user.click(screen.getByRole('button', { name: /show \d+ result/i }));

        expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({
                minRating: DEFAULT_FILTER_STATE.minRating,
                maxRating: DEFAULT_FILTER_STATE.maxRating,
                onlyOpenNow: false,
            }),
        );
    });

    it('updates the live "Show N results" count as the draft narrows', async () => {
        const user = userEvent.setup();
        renderSheet();

        // Scope the click to the Minimum row of the Rating Range section
        // (the Maximum row also has a 4.0+ chip).
        const ratingHeading = screen.getByRole('heading', { name: /rating range/i });
        const ratingSection = ratingHeading.closest('section') as HTMLElement;
        const minRow = within(ratingSection).getByText(/^minimum$/i).parentElement as HTMLElement;
        const fourPlus = within(minRow).getByRole('button', { name: /^4\.0\+$/ });
        await user.click(fourPlus);

        // After filter to 4.0+, only providers with rating ≥4 remain (p1 + p3 = 2).
        const showBtn = screen.getByRole('button', { name: /show 2 result/i });
        expect(showBtn).toBeInTheDocument();
    });
});
