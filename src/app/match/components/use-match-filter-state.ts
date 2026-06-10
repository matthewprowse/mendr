'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import { useMatchFilters } from '@/features/match/hooks/use-match-filters';

/**
 * URL-synced filter state. We push updates back to the URL via `window.history.replaceState` so
 * back/forward works as users tweak filters; we keep the existing `conversationId` query param
 * when present.
 */
export function useMatchFilterUrlState({
    conversationId,
    pathname,
    searchParams,
}: {
    conversationId: string;
    pathname: string | null;
    searchParams: URLSearchParams | ReadonlyURLSearchParams | null;
}) {
    const filterUrlBaseRef = useRef<string>('');
    useEffect(() => {
        filterUrlBaseRef.current = pathname || '';
    }, [pathname]);
    const handleFilterUrlChange = useCallback(
        (params: URLSearchParams) => {
            if (typeof window === 'undefined') return;
            const conv = conversationId
                ? `conversationId=${encodeURIComponent(conversationId)}`
                : '';
            const filterStr = params.toString();
            const search = [conv, filterStr].filter(Boolean).join('&');
            const target = `${filterUrlBaseRef.current}${search ? `?${search}` : ''}`;
            try {
                window.history.replaceState(null, '', target);
            } catch {}
        },
        [conversationId]
    );
    const {
        state: filterState,
        setState: setFilterState,
        reset: resetFilters,
        activeFilterCount,
    } = useMatchFilters({
        conversationId,
        searchParams,
        onUrlChange: handleFilterUrlChange,
    });

    return { filterState, setFilterState, resetFilters, activeFilterCount };
}
