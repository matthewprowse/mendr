import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchProvidersApi } from '../api/client';
import type { MatchLocation, MatchProvider } from '../contracts';

export function useMatchProviders(params: {
    searchRadiusMeters: number;
    resolveTradeContext: () => Promise<{ trade: string; trade_detail: string }>;
}) {
    const { searchRadiusMeters, resolveTradeContext } = params;
    const [providers, setProviders] = useState<MatchProvider[]>([]);
    const [companyIndex, setCompanyIndex] = useState(1);
    const [isProvidersLoading, setIsProvidersLoading] = useState(false);
    const lastProvidersErrorToastAtRef = useRef<number>(0);
    const lastResolvedTradeRef = useRef<string | null>(null);
    // Store radius in a ref so the callback stays stable across radius changes.
    const searchRadiusMetersRef = useRef(searchRadiusMeters);
    searchRadiusMetersRef.current = searchRadiusMeters;
    // Store provider count in a ref so the callback doesn't re-create when results arrive.
    const providersLengthRef = useRef(providers.length);
    providersLengthRef.current = providers.length;
    // AbortController ref — aborts stale in-flight requests when a newer one starts.
    const abortControllerRef = useRef<AbortController | null>(null);

    const refreshProvidersForLocation = useCallback(
        async (loc: MatchLocation) => {
            const { trade: t, trade_detail: td } = await resolveTradeContext();
            if (!t) return;

            const radius = searchRadiusMetersRef.current;
            const tradeSig = `${t}|${td}`;
            const tradeChanged = lastResolvedTradeRef.current !== tradeSig;
            lastResolvedTradeRef.current = tradeSig;

            const globalAny = globalThis as any;
            if (!globalAny.__scandioProvidersFetchThrottle) {
                globalAny.__scandioProvidersFetchThrottle = {};
            }
            const latR = Math.round(loc.lat * 100) / 100;
            const lngR = Math.round(loc.lng * 100) / 100;
            const fetchKey = `${tradeSig}:${latR}:${lngR}:${radius}`;
            const lastAt = globalAny.__scandioProvidersFetchThrottle[fetchKey] as number | undefined;
            const now = Date.now();
            if (typeof lastAt === 'number' && now - lastAt < 8000 && providersLengthRef.current > 0 && !tradeChanged) {
                return;
            }
            globalAny.__scandioProvidersFetchThrottle[fetchKey] = now;

            // Cancel any stale in-flight request; only the latest response updates state.
            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;

            setIsProvidersLoading(true);
            try {
                const data = await fetchProvidersApi(
                    {
                        lat: loc.lat,
                        lng: loc.lng,
                        trade: t,
                        ...(td ? { tradeDetail: td } : {}),
                        radius,
                    },
                    { signal: controller.signal }
                );
                // Ignore responses that were superseded by a newer request.
                if (controller.signal.aborted) return;
                if (Array.isArray(data?.providers)) {
                    setProviders(data.providers);
                    setCompanyIndex(1);
                    return;
                }
                setProviders([]);
                setCompanyIndex(1);
                const msg = data?.error || 'Failed to fetch providers';
                const tNow = Date.now();
                if (tNow - lastProvidersErrorToastAtRef.current > 5000) {
                    lastProvidersErrorToastAtRef.current = tNow;
                    toast.error(msg);
                }
            } catch (err) {
                // AbortError is expected when a newer request cancels this one — don't toast.
                if (err instanceof Error && err.name === 'AbortError') return;
                const tNow = Date.now();
                if (tNow - lastProvidersErrorToastAtRef.current > 5000) {
                    lastProvidersErrorToastAtRef.current = tNow;
                    toast.error('Failed to fetch providers');
                }
            } finally {
                if (!controller.signal.aborted) setIsProvidersLoading(false);
            }
        },
        // Stable deps: only resolveTradeContext. radius + providers.length now read from refs.
        [resolveTradeContext]
    );

    return {
        providers,
        setProviders,
        companyIndex,
        setCompanyIndex,
        isProvidersLoading,
        refreshProvidersForLocation,
    };
}
