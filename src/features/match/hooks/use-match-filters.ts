'use client';

/**
 * URL-synced filter state hook for the /match page.
 *
 * Strategy:
 *  - Defaults are conservative (no filters applied) so deep-links + back/forward stay predictable.
 *  - We read the initial state from `?f.*` query params (compact prefixed keys keep URLs short).
 *  - Updates are debounced into the URL via `router.replace` so dragging the distance slider doesn't
 *    spam the navigation stack.
 *  - `applyFilters` is a pure function exported from this module so it can be re-used by the histogram
 *    (live counts), the marker hider, and the sheet's sticky "Show N results" footer.
 *
 * Persistence: the hook also caches the latest filter snapshot in `sessionStorage` per
 * `conversationId`, so revisiting `/match` from another step restores the user's choices even when
 * the URL is rewritten by upstream redirects.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { MatchProvider } from '@/features/match/contracts';

export const SORT_OPTIONS = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'distance_asc', label: 'Distance' },
    { value: 'rating_desc', label: 'Rating' },
    { value: 'reviews_desc', label: 'Most Reviewed' },
] as const;

export type MatchSortKey = (typeof SORT_OPTIONS)[number]['value'];

export type MatchFilterState = {
    sort: MatchSortKey;
    distanceMinKm: number;
    distanceMaxKm: number;
    minRating: number; // 0 = no filter
    maxRating: number; // 0 = no cap
    onlyOpenNow: boolean;
    is247: boolean;
    hasWebsite: boolean;
    hasWorkPhotos: boolean;
    companySizes: Array<NonNullable<MatchProvider['companySize']>>;
    specialisations: string[];
    certifications: 'any' | 'yes' | 'no';
};

export const DEFAULT_FILTER_STATE: MatchFilterState = {
    sort: 'recommended',
    distanceMinKm: 0,
    distanceMaxKm: 25,
    minRating: 0,
    maxRating: 0,
    onlyOpenNow: false,
    is247: false,
    hasWebsite: false,
    hasWorkPhotos: false,
    companySizes: [],
    specialisations: [],
    certifications: 'any',
};

const URL_KEYS = {
    sort: 'f.sort',
    dmin: 'f.dmin',
    dmax: 'f.dmax',
    minRating: 'f.rmin',
    maxRating: 'f.rmax',
    open: 'f.open',
    is247: 'f.247',
    web: 'f.web',
    photos: 'f.ph',
    sizes: 'f.sz',
    specs: 'f.sp',
    certs: 'f.ce',
} as const;

const SESSION_STORAGE_KEY = (conversationId: string) =>
    `match.filters.v2:${conversationId || 'anon'}`;

function clampNumber(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function readBool(value: string | null): boolean {
    return value === '1' || value === 'true';
}

function writeBool(value: boolean): string | null {
    return value ? '1' : null;
}

function readCsv(value: string | null): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function writeCsv(values: readonly string[]): string | null {
    if (values.length === 0) return null;
    return values.join(',');
}

function parseStateFromParams(
    params: URLSearchParams | ReadonlyURLSearchParams | null
): Partial<MatchFilterState> {
    if (!params) return {};
    const out: Partial<MatchFilterState> = {};

    const sortRaw = params.get(URL_KEYS.sort);
    if (sortRaw && SORT_OPTIONS.some((opt) => opt.value === sortRaw)) {
        out.sort = sortRaw as MatchSortKey;
    }

    // Use null-check before Number() — Number('') === 0 which is finite,
    // causing a missing param to silently clamp distanceMaxKm to 1km.
    const dminRaw = params.get(URL_KEYS.dmin);
    if (dminRaw !== null) {
        const dmin = Number(dminRaw);
        if (Number.isFinite(dmin)) out.distanceMinKm = clampNumber(dmin, 0, 100);
    }
    const dmaxRaw = params.get(URL_KEYS.dmax);
    if (dmaxRaw !== null) {
        const dmax = Number(dmaxRaw);
        if (Number.isFinite(dmax) && dmax > 0) out.distanceMaxKm = clampNumber(dmax, 1, 50);
    }

    const minR = Number(params.get(URL_KEYS.minRating) ?? '');
    if (Number.isFinite(minR)) out.minRating = clampNumber(minR, 0, 5);
    const maxR = Number(params.get(URL_KEYS.maxRating) ?? '');
    if (Number.isFinite(maxR)) out.maxRating = clampNumber(maxR, 0, 5);

    if (params.has(URL_KEYS.open)) out.onlyOpenNow = readBool(params.get(URL_KEYS.open));
    if (params.has(URL_KEYS.is247)) out.is247 = readBool(params.get(URL_KEYS.is247));
    if (params.has(URL_KEYS.web)) out.hasWebsite = readBool(params.get(URL_KEYS.web));
    if (params.has(URL_KEYS.photos)) out.hasWorkPhotos = readBool(params.get(URL_KEYS.photos));

    if (params.has(URL_KEYS.sizes)) {
        const sizes = readCsv(params.get(URL_KEYS.sizes)).filter((s): s is MatchFilterState['companySizes'][number] =>
            ['solo', 'small', 'mid', 'large'].includes(s)
        );
        out.companySizes = sizes;
    }

    if (params.has(URL_KEYS.specs)) out.specialisations = readCsv(params.get(URL_KEYS.specs));
    if (params.has(URL_KEYS.certs)) {
        const certRaw = String(params.get(URL_KEYS.certs) ?? '').trim().toLowerCase();
        out.certifications =
            certRaw === 'yes' || certRaw === 'no' || certRaw === 'any' ? certRaw : 'any';
    }

    return out;
}

/** Build URL params for the active filter delta vs defaults — keeps URLs minimal/clean. */
export function buildSearchParamsForFilters(
    state: MatchFilterState
): URLSearchParams {
    const params = new URLSearchParams();
    if (state.sort !== DEFAULT_FILTER_STATE.sort) params.set(URL_KEYS.sort, state.sort);
    if (state.distanceMinKm !== DEFAULT_FILTER_STATE.distanceMinKm)
        params.set(URL_KEYS.dmin, String(state.distanceMinKm));
    if (state.distanceMaxKm !== DEFAULT_FILTER_STATE.distanceMaxKm)
        params.set(URL_KEYS.dmax, String(state.distanceMaxKm));
    if (state.minRating !== DEFAULT_FILTER_STATE.minRating)
        params.set(URL_KEYS.minRating, String(state.minRating));
    if (state.maxRating !== DEFAULT_FILTER_STATE.maxRating)
        params.set(URL_KEYS.maxRating, String(state.maxRating));
    const open = writeBool(state.onlyOpenNow);
    if (open) params.set(URL_KEYS.open, open);
    const f247 = writeBool(state.is247);
    if (f247) params.set(URL_KEYS.is247, f247);
    const web = writeBool(state.hasWebsite);
    if (web) params.set(URL_KEYS.web, web);
    const ph = writeBool(state.hasWorkPhotos);
    if (ph) params.set(URL_KEYS.photos, ph);
    const sizes = writeCsv(state.companySizes);
    if (sizes) params.set(URL_KEYS.sizes, sizes);
    const specs = writeCsv(state.specialisations);
    if (specs) params.set(URL_KEYS.specs, specs);
    if (state.certifications !== 'any') params.set(URL_KEYS.certs, state.certifications);
    return params;
}

/** Pure function: returns the providers that survive the active filters. Stable order = input order. */
export function applyFilters(
    providers: readonly MatchProvider[],
    state: MatchFilterState
): MatchProvider[] {
    const min = Math.min(state.distanceMinKm, state.distanceMaxKm);
    const max = Math.max(state.distanceMinKm, state.distanceMaxKm);
    const specSet = new Set<string>(state.specialisations.map((s) => s.toLowerCase()));
    const sizeSet = new Set<string>(state.companySizes);
    const normalizedMinRating = clampNumber(state.minRating, 0, 5);
    const normalizedMaxRating = clampNumber(state.maxRating, 0, 5);
    const ratingFloor =
        normalizedMaxRating > 0 ? Math.min(normalizedMinRating, normalizedMaxRating) : normalizedMinRating;
    const ratingCeil =
        normalizedMaxRating > 0 ? Math.max(normalizedMinRating, normalizedMaxRating) : 0;

    return providers.filter((p) => {
        if (typeof p.distanceKm === 'number' && Number.isFinite(p.distanceKm)) {
            if (p.distanceKm < min - 0.05 || p.distanceKm > max + 0.05) return false;
        }
        if (ratingFloor > 0) {
            if (typeof p.rating !== 'number' || p.rating < ratingFloor - 0.0001) return false;
        }
        if (ratingCeil > 0) {
            if (typeof p.rating !== 'number' || p.rating > ratingCeil + 0.0001) return false;
        }
        if (state.is247) {
            // Must have 24/7 in their opening hours OR a 24/7-style specialisation
            const has247Hours = p.weekdayDescriptions?.some((d) => /open\s*24\s*hours/i.test(d));
            const has247Spec = (p.specialisations ?? []).some((s) =>
                /24.?7|24\s*hours|always\s*open/i.test(s)
            );
            if (!has247Hours && !has247Spec) return false;
        }
        if (state.onlyOpenNow) {
            // Exempt providers verified to be open 24/7 — they are always open
            const is247 = p.weekdayDescriptions?.some((d) => /open\s*24\s*hours/i.test(d));
            if (!is247 && p.isOpen !== true) return false;
        }
        if (state.hasWebsite && !(p.website && p.website.trim())) return false;
        if (state.hasWorkPhotos && !(p.hasWorkPhotos || (p.images && p.images.length > 0))) return false;
        if (sizeSet.size > 0) {
            if (!p.companySize || !sizeSet.has(p.companySize)) return false;
        }
        if (state.certifications === 'yes' && (!Array.isArray(p.certifications) || p.certifications.length === 0)) {
            return false;
        }
        if (state.certifications === 'no' && Array.isArray(p.certifications) && p.certifications.length > 0) {
            return false;
        }
        if (specSet.size > 0) {
            const have = new Set((p.specialisations ?? []).map((s) => s.toLowerCase()));
            for (const slug of specSet) {
                if (!have.has(slug)) return false;
            }
        }
        return true;
    });
}

/** Stable comparator for the chosen sort key. Falls back to `recommendedScore` when supplied. */
export function compareForSort(
    sort: MatchSortKey,
    a: MatchProvider,
    b: MatchProvider,
    recommendedScore: (p: MatchProvider) => number
): number {
    if (sort === 'rating_desc') {
        return (b.rating ?? -1) - (a.rating ?? -1) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
    }
    if (sort === 'distance_asc') {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        return da - db;
    }
    if (sort === 'reviews_desc') {
        return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
    }
    // recommended
    return recommendedScore(b) - recommendedScore(a);
}

/** Count of filters set away from their default values (used for the header badge). */
export function countActiveFilters(state: MatchFilterState): number {
    let n = 0;
    if (state.sort !== DEFAULT_FILTER_STATE.sort) n += 1;
    if (state.distanceMinKm !== DEFAULT_FILTER_STATE.distanceMinKm) n += 1;
    if (state.distanceMaxKm !== DEFAULT_FILTER_STATE.distanceMaxKm) n += 1;
    if (state.minRating > 0) n += 1;
    if (state.maxRating > 0) n += 1;
    if (state.onlyOpenNow) n += 1;
    if (state.is247) n += 1;
    if (state.hasWebsite) n += 1;
    if (state.hasWorkPhotos) n += 1;
    if (state.companySizes.length > 0) n += 1;
    if (state.specialisations.length > 0) n += 1;
    if (state.certifications !== 'any') n += 1;
    return n;
}

export type UseMatchFiltersOptions = {
    /** Used to scope `sessionStorage` cache. */
    conversationId: string;
    /** Initial URLSearchParams snapshot (e.g. from `useSearchParams()`). */
    searchParams: URLSearchParams | ReadonlyURLSearchParams | null;
    /** Called when state changes — typically a debounced `router.replace`. */
    onUrlChange?: (params: URLSearchParams) => void;
};

export type UseMatchFiltersReturn = {
    state: MatchFilterState;
    setState: (next: MatchFilterState) => void;
    update: <K extends keyof MatchFilterState>(key: K, value: MatchFilterState[K]) => void;
    reset: () => void;
    activeFilterCount: number;
};

export function useMatchFilters(options: UseMatchFiltersOptions): UseMatchFiltersReturn {
    const { conversationId, searchParams, onUrlChange } = options;

    const [state, setStateInternal] = useState<MatchFilterState>(() => {
        const fromUrl = parseStateFromParams(searchParams);
        if (Object.keys(fromUrl).length > 0) {
            return { ...DEFAULT_FILTER_STATE, ...fromUrl };
        }
        if (typeof window === 'undefined') return DEFAULT_FILTER_STATE;
        try {
            const cached = window.sessionStorage.getItem(SESSION_STORAGE_KEY(conversationId));
            if (!cached) return DEFAULT_FILTER_STATE;
            const parsed = JSON.parse(cached) as Partial<MatchFilterState>;
            return { ...DEFAULT_FILTER_STATE, ...parsed };
        } catch {
            return DEFAULT_FILTER_STATE;
        }
    });

    const onUrlChangeRef = useRef(onUrlChange);
    onUrlChangeRef.current = onUrlChange;

    // Persist + propagate to URL on change.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.sessionStorage.setItem(
                SESSION_STORAGE_KEY(conversationId),
                JSON.stringify(state)
            );
        } catch {}
        const params = buildSearchParamsForFilters(state);
        onUrlChangeRef.current?.(params);
    }, [conversationId, state]);

    const setState = useCallback((next: MatchFilterState) => {
        setStateInternal(next);
    }, []);

    const update = useCallback(
        <K extends keyof MatchFilterState>(key: K, value: MatchFilterState[K]) => {
            setStateInternal((prev) => ({ ...prev, [key]: value }));
        },
        []
    );

    const reset = useCallback(() => {
        setStateInternal(DEFAULT_FILTER_STATE);
    }, []);

    const activeFilterCount = useMemo(() => countActiveFilters(state), [state]);

    return { state, setState, update, reset, activeFilterCount };
}
