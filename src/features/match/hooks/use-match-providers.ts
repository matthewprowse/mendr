import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchProvidersApi, prefetchEnrichmentForMatchProviders } from '../api/client';
import type { MatchLocation, MatchProvider } from '../contracts';

const MATCH_PROVIDERS_CACHE_KEY = 'match.providers.cache.v1';
const MATCH_PROVIDERS_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedProvidersEntry = {
    providers: MatchProvider[];
    cachedAt: number;
};

function readCachedProviders(requestKey: string): MatchProvider[] | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(MATCH_PROVIDERS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Record<string, CachedProvidersEntry>;
        const entry = parsed?.[requestKey];
        if (!entry || !Array.isArray(entry.providers)) return null;
        if (Date.now() - Number(entry.cachedAt || 0) > MATCH_PROVIDERS_CACHE_TTL_MS) return null;
        return entry.providers;
    } catch {
        return null;
    }
}

function writeCachedProviders(requestKey: string, providers: MatchProvider[]): void {
    if (typeof window === 'undefined') return;
    try {
        const raw = window.sessionStorage.getItem(MATCH_PROVIDERS_CACHE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, CachedProvidersEntry>) : {};
        parsed[requestKey] = {
            providers,
            cachedAt: Date.now(),
        };
        window.sessionStorage.setItem(MATCH_PROVIDERS_CACHE_KEY, JSON.stringify(parsed));
    } catch {
        // Best-effort cache only; never block the providers flow.
    }
}

function buildViewportRequestKey(
    loc: MatchLocation,
    trade: string,
    tradeDetail: string,
    radiusMeters: number
): string {
    // Bucket viewport searches so tiny pans/zooms can instantly reuse nearby results.
    // 3 decimals ~= 110m buckets; radius bucketed to 500m bands.
    const latBucket = loc.lat.toFixed(3);
    const lngBucket = loc.lng.toFixed(3);
    const radiusBucket = String(Math.max(500, Math.round(radiusMeters / 500) * 500));
    return [
        latBucket,
        lngBucket,
        trade.trim().toLowerCase(),
        tradeDetail.trim().toLowerCase(),
        radiusBucket,
    ].join('|');
}

async function waitForPageVisible(signal: AbortSignal, maxWaitMs = 2500): Promise<void> {
    if (typeof document === 'undefined') return;
    if (!document.hidden) return;

    await Promise.race([
        new Promise<void>((resolve) => {
            const onAbort = () => cleanup(resolve);
            const onVis = () => {
                if (!document.hidden) cleanup(resolve);
            };
            const cleanup = (done: () => void) => {
                document.removeEventListener('visibilitychange', onVis);
                signal.removeEventListener('abort', onAbort);
                done();
            };

            document.addEventListener('visibilitychange', onVis, { passive: true });
            signal.addEventListener('abort', onAbort, { passive: true } as any);
        }),
        new Promise<void>((resolve) => {
            const t = setTimeout(resolve, maxWaitMs);
            signal.addEventListener('abort', () => clearTimeout(t), { once: true });
        }),
    ]);
}

function isSuspendedNetworkError(err: unknown): boolean {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    if (!(err instanceof Error)) return false;
    const msg = `${err.name} ${err.message}`.toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('networkerror');
}

export function useMatchProviders(params: {
    resolveTradeContext: () => Promise<{ trade: string; trade_detail: string }>;
    /** When it changes, in-memory trade cache is cleared. */
    conversationId?: string;
}) {
    const { resolveTradeContext, conversationId } = params;
    const [providers, setProviders] = useState<MatchProvider[]>([]);
    const [companyIndex, setCompanyIndex] = useState(1);
    const [isProvidersLoading, setIsProvidersLoading] = useState(false);
    const [isRefreshingProvidersInBackground, setIsRefreshingProvidersInBackground] = useState(false);
    /**
     * True while the visible list was seeded from the viewport sessionStorage cache (same area/trade).
     * Match page skips card-level enrich/queue until a fresh `/api/providers` response replaces the list.
     */
    const [providersFromViewportCache, setProvidersFromViewportCache] = useState(false);
    const lastProvidersErrorToastAtRef = useRef<number>(0);
    const lastMissingTradeToastAtRef = useRef<number>(0);
    const providersRef = useRef<MatchProvider[]>(providers);
    providersRef.current = providers;
    const companyIndexRef = useRef(companyIndex);
    companyIndexRef.current = companyIndex;
    const seenPlaceIdsRef = useRef<Set<string>>(new Set());
    const abortControllerRef = useRef<AbortController | null>(null);
    const inFlightRef = useRef<{ key: string; promise: Promise<void>; controller: AbortController } | null>(
        null
    );
    const tradeContextConvRef = useRef<string | undefined>(undefined);
    const tradeContextCacheRef = useRef<{ trade: string; trade_detail: string } | null>(null);
    if (tradeContextConvRef.current !== conversationId) {
        tradeContextConvRef.current = conversationId;
        tradeContextCacheRef.current = null;
    }

    useEffect(() => {
        setProvidersFromViewportCache(false);
    }, [conversationId]);

    const refreshProvidersForLocation = useCallback(
        async (loc: MatchLocation, radiusMeters: number) => {
            let t = tradeContextCacheRef.current?.trade ?? '';
            let td = tradeContextCacheRef.current?.trade_detail ?? '';
            if (!t) {
                const r = await resolveTradeContext();
                t = r.trade;
                td = r.trade_detail;
                if (t) tradeContextCacheRef.current = { trade: t, trade_detail: td };
            }
            if (!t) {
                const tNow = Date.now();
                if (tNow - lastMissingTradeToastAtRef.current > 12_000) {
                    lastMissingTradeToastAtRef.current = tNow;
                    toast.error(
                        'Could not load the trade for this report (connection or permissions). Try again, or return to your diagnosis and tap Find a Contractor once more.'
                    );
                }
                return;
            }

            const radius = Math.round(radiusMeters);
            const requestKey = buildViewportRequestKey(loc, t, td, radius);
            const cachedProviders = readCachedProviders(requestKey);
            const hasCachedProviders = Array.isArray(cachedProviders) && cachedProviders.length > 0;

            if (hasCachedProviders) {
                setProvidersFromViewportCache(true);
                setProviders(cachedProviders!);
                providersRef.current = cachedProviders!;
                seenPlaceIdsRef.current = new Set(
                    cachedProviders!.map((p) => p.placeId).filter(Boolean)
                );
                if (companyIndexRef.current > cachedProviders!.length) {
                    setCompanyIndex(1);
                }
            } else {
                setProvidersFromViewportCache(false);
            }

            const inFlight = inFlightRef.current;
            if (inFlight && inFlight.key === requestKey && !inFlight.controller.signal.aborted) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[match] de-duped identical providers request');
                }
                await inFlight.promise;
                return;
            }

            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            let finishInFlight: () => void = () => {};
            const inFlightPromise = new Promise<void>((resolve) => {
                finishInFlight = resolve;
            });
            inFlightRef.current = { key: requestKey, promise: inFlightPromise, controller };

            setIsProvidersLoading(!hasCachedProviders);
            setIsRefreshingProvidersInBackground(hasCachedProviders);
            try {
                const t0 = Date.now();
                if (process.env.NODE_ENV === 'development') {
                    console.log('[match] fetching providers (viewport)…');
                }
                await waitForPageVisible(controller.signal);
                if (controller.signal.aborted) return;

                const firstResult = await fetchProvidersApi(
                    {
                        lat: loc.lat,
                        lng: loc.lng,
                        trade: t,
                        ...(td ? { tradeDetail: td } : {}),
                        radius,
                        quick: true,
                    },
                    { signal: controller.signal }
                );
                if (controller.signal.aborted) return;

                const firstPage = firstResult.data;

                if (firstResult.ok && Array.isArray(firstPage?.providers)) {
                    const fetchedProviders: MatchProvider[] = [...firstPage.providers];

                    prefetchEnrichmentForMatchProviders(fetchedProviders);

                    seenPlaceIdsRef.current = new Set(
                        fetchedProviders.map((p) => p.placeId).filter(Boolean)
                    );
                    setProvidersFromViewportCache(false);
                    setProviders(fetchedProviders);
                    writeCachedProviders(requestKey, fetchedProviders);
                    setCompanyIndex(1);
                    if (process.env.NODE_ENV === 'development') {
                        console.log(
                            `[match] providers received in ${Date.now() - t0}ms — ${fetchedProviders.length} results`
                        );
                    }
                    return;
                }

                if (!firstResult.ok && firstPage?.code === 'PLACES_UNAVAILABLE') {
                    const tNow = Date.now();
                    if (tNow - lastProvidersErrorToastAtRef.current > 5000) {
                        lastProvidersErrorToastAtRef.current = tNow;
                        toast.error(
                            firstPage?.error ||
                                'Search temporarily unavailable. Please try again in a moment.'
                        );
                    }
                    setProvidersFromViewportCache(false);
                    setProviders([]);
                    setCompanyIndex(1);
                    return;
                }

                setProvidersFromViewportCache(false);
                setProviders([]);
                setCompanyIndex(1);
                const msg = firstPage?.error || 'Failed to fetch providers';
                const tNow = Date.now();
                if (tNow - lastProvidersErrorToastAtRef.current > 5000) {
                    lastProvidersErrorToastAtRef.current = tNow;
                    toast.error(msg);
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
                if (isSuspendedNetworkError(err) && typeof document !== 'undefined' && document.hidden) return;
                const tNow = Date.now();
                if (tNow - lastProvidersErrorToastAtRef.current > 5000) {
                    lastProvidersErrorToastAtRef.current = tNow;
                    toast.error('Failed to fetch providers');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsProvidersLoading(false);
                    setIsRefreshingProvidersInBackground(false);
                }
                if (inFlightRef.current?.controller === controller) {
                    inFlightRef.current = null;
                }
                finishInFlight();
            }
        },
        [resolveTradeContext]
    );

    return {
        providers,
        setProviders,
        companyIndex,
        setCompanyIndex,
        isProvidersLoading,
        isRefreshingProvidersInBackground,
        refreshProvidersForLocation,
        providersFromViewportCache,
    };
}
