import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchProvidersApi } from '../api/client';
import type { MatchLocation, MatchProvider } from '../contracts';

async function waitForPageVisible(signal: AbortSignal): Promise<void> {
    if (typeof document === 'undefined') return;
    if (!document.hidden) return;

    await new Promise<void>((resolve) => {
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
    });
}

function isSuspendedNetworkError(err: unknown): boolean {
    // In practice, a suspended tab often yields a generic TypeError("Failed to fetch")
    // with a console line showing net::ERR_NETWORK_IO_SUSPENDED.
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    if (!(err instanceof Error)) return false;
    const msg = `${err.name} ${err.message}`.toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('networkerror');
}

export function useMatchProviders(params: {
    searchRadiusMeters: number;
    resolveTradeContext: () => Promise<{ trade: string; trade_detail: string }>;
}) {
    const { searchRadiusMeters, resolveTradeContext } = params;
    const [providers, setProviders] = useState<MatchProvider[]>([]);
    const [companyIndex, setCompanyIndex] = useState(1);
    const [isProvidersLoading, setIsProvidersLoading] = useState(false);
    const [isLoadingMoreForExpandedRadius, setIsLoadingMoreForExpandedRadius] = useState(false);
    const lastProvidersErrorToastAtRef = useRef<number>(0);
    const lastMissingTradeToastAtRef = useRef<number>(0);
    // Store radius in a ref so the callback stays stable across radius changes.
    const searchRadiusMetersRef = useRef(searchRadiusMeters);
    searchRadiusMetersRef.current = searchRadiusMeters;
    // Track previous radius so we can detect "expanded radius" fetches and append.
    const previousRadiusRef = useRef(searchRadiusMeters);
    // Keep latest providers in a ref for stable callback access.
    const providersRef = useRef<MatchProvider[]>(providers);
    providersRef.current = providers;
    // Track what the user has already had on screen (for "prefer unseen" ordering).
    const seenPlaceIdsRef = useRef<Set<string>>(new Set());
    // AbortController ref — aborts stale in-flight requests when a newer one starts.
    const abortControllerRef = useRef<AbortController | null>(null);
    // In-flight de-dupe for identical request parameters.
    const inFlightRef = useRef<{ key: string; promise: Promise<void>; controller: AbortController } | null>(null);

    const refreshProvidersForLocation = useCallback(
        async (loc: MatchLocation) => {
            const { trade: t, trade_detail: td } = await resolveTradeContext();
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

            const radius = searchRadiusMetersRef.current;
            const previousRadius = previousRadiusRef.current;
            const expandingRadius =
                radius > previousRadius && providersRef.current.length > 0;
            previousRadiusRef.current = radius;
            const requestKey = [
                loc.lat.toFixed(6),
                loc.lng.toFixed(6),
                t.trim().toLowerCase(),
                td.trim().toLowerCase(),
                String(radius),
            ].join('|');

            const inFlight = inFlightRef.current;
            if (inFlight && inFlight.key === requestKey && !inFlight.controller.signal.aborted) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[match] de-duped identical providers request');
                }
                await inFlight.promise;
                return;
            }

            // Do not time-throttle by (lat,lng,radius): switching service radius and back within a few
            // seconds must refetch — a global 8s skip previously left the wrong radius’s results on screen.

            // Cancel any stale in-flight request; only the latest response updates state.
            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            let finishInFlight: (() => void) | null = null;
            const inFlightPromise = new Promise<void>((resolve) => {
                finishInFlight = resolve;
            });
            inFlightRef.current = { key: requestKey, promise: inFlightPromise, controller };

            setIsProvidersLoading(true);
            setIsLoadingMoreForExpandedRadius(expandingRadius);
            try {
                const t0 = Date.now();
                if (process.env.NODE_ENV === 'development') {
                    console.log('[match] fetching providers...');
                }
                // If the browser has backgrounded/suspended this tab, fetching can fail with
                // net::ERR_NETWORK_IO_SUSPENDED. Wait until we’re visible again.
                await waitForPageVisible(controller.signal);
                if (controller.signal.aborted) return;

                const firstResult = await fetchProvidersApi(
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

                const firstPage = firstResult.data;

                if (firstResult.ok && Array.isArray(firstPage?.providers)) {
                    const fetchedProviders: MatchProvider[] = [...firstPage.providers];

                    // When expanding radius, pull a few more pages (if available) so the user actually
                    // sees additional providers at larger radii.
                    if (expandingRadius && firstPage.searchQuery) {
                        const MAX_EXTRA_PAGES = 3;
                        let nextToken = firstPage.nextPageToken ?? null;
                        let pagesFetched = 0;
                        while (nextToken && pagesFetched < MAX_EXTRA_PAGES) {
                            await waitForPageVisible(controller.signal);
                            if (controller.signal.aborted) return;
                            const nextResult = await fetchProvidersApi(
                                {
                                    lat: loc.lat,
                                    lng: loc.lng,
                                    trade: t,
                                    ...(td ? { tradeDetail: td } : {}),
                                    radius,
                                    pageToken: nextToken,
                                    searchQuery: firstPage.searchQuery,
                                },
                                { signal: controller.signal }
                            );
                            if (controller.signal.aborted) return;
                            const nextPage = nextResult.data;
                            if (nextResult.ok && Array.isArray(nextPage?.providers)) {
                                fetchedProviders.push(...nextPage.providers);
                            }
                            nextToken = nextPage?.nextPageToken ?? null;
                            pagesFetched += 1;
                        }
                    }

                    if (expandingRadius) {
                        // Mark everything currently on screen as "seen" so newly fetched providers
                        // can be preferred in ordering without reshuffling the existing set.
                        providersRef.current.forEach((p) => {
                            if (p?.placeId) seenPlaceIdsRef.current.add(p.placeId);
                        });

                        const seen = new Set(
                            providersRef.current.map((p) => p.placeId)
                        );
                        const additionalAll = fetchedProviders.filter((p) => {
                            if (seen.has(p.placeId)) return false;
                            seen.add(p.placeId);
                            return true;
                        });

                        // Prefer providers the user has NOT seen before in this session.
                        const unseenAdditional = additionalAll.filter(
                            (p) => !seenPlaceIdsRef.current.has(p.placeId)
                        );
                        const seenAdditional = additionalAll.filter((p) =>
                            seenPlaceIdsRef.current.has(p.placeId)
                        );
                        const additional = [...unseenAdditional, ...seenAdditional];

                        if (additional.length > 0) {
                            additional.forEach((p) => seenPlaceIdsRef.current.add(p.placeId));
                            setProviders([...providersRef.current, ...additional]);
                        } else {
                            // Keep current list if expansion returned no new providers.
                            setProviders(providersRef.current);
                        }
                        if (process.env.NODE_ENV === 'development') {
                            console.log(
                                `[match] providers received in ${Date.now() - t0}ms — ${fetchedProviders.length} results`
                            );
                        }
                    } else {
                        // New search: reset "seen" history.
                        seenPlaceIdsRef.current = new Set(
                            fetchedProviders.map((p) => p.placeId).filter(Boolean)
                        );
                        setProviders(fetchedProviders);
                        setCompanyIndex(1);
                        if (process.env.NODE_ENV === 'development') {
                            console.log(
                                `[match] providers received in ${Date.now() - t0}ms — ${fetchedProviders.length} results`
                            );
                        }
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
                    if (!expandingRadius) {
                        setProviders([]);
                        setCompanyIndex(1);
                    }
                    return;
                }

                if (!expandingRadius) {
                    setProviders([]);
                    setCompanyIndex(1);
                }
                const msg = firstPage?.error || 'Failed to fetch providers';
                const tNow = Date.now();
                if (tNow - lastProvidersErrorToastAtRef.current > 5000) {
                    lastProvidersErrorToastAtRef.current = tNow;
                    toast.error(msg);
                }
            } catch (err) {
                // AbortError is expected when a newer request cancels this one — don't toast.
                if (err instanceof Error && err.name === 'AbortError') return;
                // If the browser suspended IO (background tab / power saver), don’t treat it as a hard error.
                if (isSuspendedNetworkError(err) && typeof document !== 'undefined' && document.hidden) return;
                const tNow = Date.now();
                if (tNow - lastProvidersErrorToastAtRef.current > 5000) {
                    lastProvidersErrorToastAtRef.current = tNow;
                    toast.error('Failed to fetch providers');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsProvidersLoading(false);
                    setIsLoadingMoreForExpandedRadius(false);
                }
                if (inFlightRef.current?.controller === controller) {
                    inFlightRef.current = null;
                }
                finishInFlight?.();
            }
        },
        // Stable deps: radius read from searchRadiusMetersRef inside the callback.
        [resolveTradeContext]
    );

    return {
        providers,
        setProviders,
        companyIndex,
        setCompanyIndex,
        isProvidersLoading,
        isLoadingMoreForExpandedRadius,
        refreshProvidersForLocation,
    };
}
