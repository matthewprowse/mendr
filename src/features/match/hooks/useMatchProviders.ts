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
    const providersFetchInFlightRef = useRef<boolean>(false);
    const lastProvidersErrorToastAtRef = useRef<number>(0);
    const lastResolvedTradeRef = useRef<string | null>(null);

    const refreshProvidersForLocation = useCallback(
        async (loc: MatchLocation) => {
            const { trade: t, trade_detail: td } = await resolveTradeContext();
            if (!t) return;

            const tradeSig = `${t}|${td}`;
            const tradeChanged = lastResolvedTradeRef.current !== tradeSig;
            lastResolvedTradeRef.current = tradeSig;

            const globalAny = globalThis as any;
            if (!globalAny.__scandioProvidersFetchThrottle) {
                globalAny.__scandioProvidersFetchThrottle = {};
            }
            const latR = Math.round(loc.lat * 100) / 100;
            const lngR = Math.round(loc.lng * 100) / 100;
            const fetchKey = `${tradeSig}:${latR}:${lngR}:${searchRadiusMeters}`;
            const lastAt = globalAny.__scandioProvidersFetchThrottle[fetchKey] as number | undefined;
            const now = Date.now();
            if (typeof lastAt === 'number' && now - lastAt < 8000 && providers.length > 0 && !tradeChanged) {
                return;
            }
            globalAny.__scandioProvidersFetchThrottle[fetchKey] = now;

            if (providersFetchInFlightRef.current) return;
            providersFetchInFlightRef.current = true;
            setIsProvidersLoading(true);
            try {
                const data = await fetchProvidersApi({
                    lat: loc.lat,
                    lng: loc.lng,
                    trade: t,
                    ...(td ? { tradeDetail: td } : {}),
                    radius: searchRadiusMeters,
                });
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
            } finally {
                providersFetchInFlightRef.current = false;
                setIsProvidersLoading(false);
            }
        },
        [providers.length, resolveTradeContext, searchRadiusMeters]
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
