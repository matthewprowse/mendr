/**
 * Phase 5 — useMatchFilters + its pure helpers.
 *
 * Covers the URL-param parse/serialise round trip, the pure `applyFilters`
 * predicate, `compareForSort`, `countActiveFilters`, and the hook's
 * default-init / update / reset behaviour. jsdom is required for the hook's
 * sessionStorage persistence effect.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
    useMatchFilters,
    applyFilters,
    compareForSort,
    countActiveFilters,
    buildSearchParamsForFilters,
    DEFAULT_FILTER_STATE,
    type MatchFilterState,
} from '@/features/match/hooks/use-match-filters';
import type { MatchProvider } from '@/features/match/contracts';

function provider(overrides: Partial<MatchProvider>): MatchProvider {
    return {
        placeId: 'places/x',
        name: 'Test',
        address: 'Addr',
        rating: 4,
        ratingCount: 10,
        latitude: null,
        longitude: null,
        distanceKm: 5,
        durationText: '',
        website: null,
        phone: null,
        summary: '',
        ...overrides,
    };
}

beforeEach(() => {
    window.sessionStorage.clear();
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('applyFilters', () => {
    it('keeps everything under default state', () => {
        const list = [provider({ distanceKm: 1 }), provider({ distanceKm: 20 })];
        expect(applyFilters(list, DEFAULT_FILTER_STATE)).toHaveLength(2);
    });

    it('filters by distance band', () => {
        const list = [provider({ distanceKm: 2 }), provider({ distanceKm: 40 })];
        const state: MatchFilterState = { ...DEFAULT_FILTER_STATE, distanceMaxKm: 10 };
        expect(applyFilters(list, state)).toHaveLength(1);
    });

    it('filters by minimum rating', () => {
        const list = [provider({ rating: 4.8 }), provider({ rating: 3.2 }), provider({ rating: null })];
        const state: MatchFilterState = { ...DEFAULT_FILTER_STATE, minRating: 4 };
        expect(applyFilters(list, state)).toHaveLength(1);
    });

    it('filters by hasWebsite', () => {
        const list = [provider({ website: 'https://x.co' }), provider({ website: null })];
        const state: MatchFilterState = { ...DEFAULT_FILTER_STATE, hasWebsite: true };
        expect(applyFilters(list, state)).toHaveLength(1);
    });

    it('filters by onlyOpenNow but exempts 24-hour providers', () => {
        const list = [
            provider({ isOpen: true }),
            provider({ isOpen: false }),
            provider({ isOpen: false, weekdayDescriptions: ['Monday: Open 24 hours'] }),
        ];
        const state: MatchFilterState = { ...DEFAULT_FILTER_STATE, onlyOpenNow: true };
        const result = applyFilters(list, state);
        expect(result).toHaveLength(2);
    });

    it('requires all selected specialisations (AND semantics)', () => {
        const list = [
            provider({ specialisations: ['geysers', 'drains'] }),
            provider({ specialisations: ['geysers'] }),
        ];
        const state: MatchFilterState = {
            ...DEFAULT_FILTER_STATE,
            specialisations: ['geysers', 'drains'],
        };
        expect(applyFilters(list, state)).toHaveLength(1);
    });
});

describe('compareForSort', () => {
    const score = (p: MatchProvider) => p.ratingCount;
    it('sorts by rating descending', () => {
        const a = provider({ rating: 3 });
        const b = provider({ rating: 5 });
        expect(compareForSort('rating_desc', a, b, score)).toBeGreaterThan(0);
    });
    it('sorts by distance ascending', () => {
        const a = provider({ distanceKm: 2 });
        const b = provider({ distanceKm: 8 });
        expect(compareForSort('distance_asc', a, b, score)).toBeLessThan(0);
    });
    it('sorts by review count descending', () => {
        const a = provider({ ratingCount: 5 });
        const b = provider({ ratingCount: 50 });
        expect(compareForSort('reviews_desc', a, b, score)).toBeGreaterThan(0);
    });
    it('falls back to the recommended score', () => {
        const a = provider({ ratingCount: 1 });
        const b = provider({ ratingCount: 9 });
        expect(compareForSort('recommended', a, b, score)).toBeGreaterThan(0);
    });
});

describe('countActiveFilters', () => {
    it('returns 0 for the default state', () => {
        expect(countActiveFilters(DEFAULT_FILTER_STATE)).toBe(0);
    });
    it('counts each non-default field', () => {
        const state: MatchFilterState = {
            ...DEFAULT_FILTER_STATE,
            sort: 'rating_desc',
            minRating: 4,
            hasWebsite: true,
        };
        expect(countActiveFilters(state)).toBe(3);
    });
});

describe('buildSearchParamsForFilters', () => {
    it('omits defaults and serialises the delta only', () => {
        const params = buildSearchParamsForFilters({
            ...DEFAULT_FILTER_STATE,
            sort: 'distance_asc',
            hasWebsite: true,
        });
        expect(params.get('f.sort')).toBe('distance_asc');
        expect(params.get('f.web')).toBe('1');
        expect(params.get('f.open')).toBeNull();
    });
});

describe('useMatchFilters', () => {
    it('initialises with defaults when no params and no storage', () => {
        const { result } = renderHook(() =>
            useMatchFilters({ conversationId: 'c1', searchParams: null }),
        );
        expect(result.current.state).toEqual(DEFAULT_FILTER_STATE);
        expect(result.current.activeFilterCount).toBe(0);
    });

    it('hydrates initial state from URL params', () => {
        const params = new URLSearchParams('f.sort=rating_desc&f.web=1');
        const { result } = renderHook(() =>
            useMatchFilters({ conversationId: 'c2', searchParams: params }),
        );
        expect(result.current.state.sort).toBe('rating_desc');
        expect(result.current.state.hasWebsite).toBe(true);
    });

    it('update mutates a single key and reset restores defaults', () => {
        const { result } = renderHook(() =>
            useMatchFilters({ conversationId: 'c3', searchParams: null }),
        );
        act(() => result.current.update('minRating', 4));
        expect(result.current.state.minRating).toBe(4);
        act(() => result.current.reset());
        expect(result.current.state).toEqual(DEFAULT_FILTER_STATE);
    });

    it('calls onUrlChange when the state changes', () => {
        const onUrlChange = vi.fn();
        const { result } = renderHook(() =>
            useMatchFilters({ conversationId: 'c4', searchParams: null, onUrlChange }),
        );
        act(() => result.current.update('sort', 'distance_asc'));
        expect(onUrlChange).toHaveBeenCalled();
        const lastParams = onUrlChange.mock.calls.at(-1)![0] as URLSearchParams;
        expect(lastParams.get('f.sort')).toBe('distance_asc');
    });
});
