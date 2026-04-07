'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toWhatsAppPhone } from '@/lib/utils';
import { setLastConversationIdForWhatsApp } from '@/lib/whatsapp-prefill';
import { ArrowLeft, ArrowRight, Car, Check, Copy, ExternalLink, Loader2, LocateFixed, Star } from 'lucide-react';
import { toast } from 'sonner';
import { FlowStepHeader } from '@/components/flow-header';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { MatchLocation, MatchProvider } from '@/features/match/contracts';
import {
    geocodeApi,
    reviewsCountApi,
    queueEnrichmentApi,
    fetchEnrichmentApi,
    restoreProviderTokenApi,
} from '@/features/match/api/client';
import type { EnrichmentCacheEntry } from '@/app/api/enrich/get/route';
import { useMatchConversationContext } from '@/features/match/hooks/useMatchConversationContext';
import { useMatchProviders } from '@/features/match/hooks/useMatchProviders';
import { useMatchMap } from '@/features/match/hooks/useMatchMap';
import { loadMatchPageCache, saveMatchPageCache } from '@/features/match/cache/match-page-cache';
import { MatchNoProvidersEmpty } from '@/app/match/_components/match-no-providers-empty';
import { fetchConversationDiagnosis } from '@/lib/conversations-api';

const RADIUS_OPTIONS_KM = [5, 10, 20, 50] as const;

function formatProviderAddress(raw: string | null | undefined): string {
    const s = (raw ?? '').trim();
    if (!s) return '';

    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return '';

    // Strip trailing country + postcode (e.g. "..., 7700, South Africa" => "...").
    const COUNTRY_RE = /(south africa)/i;
    const POSTCODE_RE = /^\d{3,6}$/;

    while (parts.length > 0) {
        const last = parts[parts.length - 1] ?? '';
        if (COUNTRY_RE.test(last) || POSTCODE_RE.test(last)) {
            parts.pop();
            continue;
        }
        break;
    }

    return parts.join(', ');
}

function enrichmentEntryForProvider(
    cache: Record<string, EnrichmentCacheEntry>,
    provider: MatchProvider
): EnrichmentCacheEntry | undefined {
    const byPlaceId = cache[provider.placeId];
    if (byPlaceId) return byPlaceId;
    const raw = (provider.place_id ?? provider.placeId.replace(/^places\//, '')).trim();
    if (raw) return cache[raw];
    return undefined;
}

function hasEnrichedSummary(
    cache: Record<string, EnrichmentCacheEntry>,
    provider: MatchProvider | null
): boolean {
    if (!provider) return false;
    const entry = enrichmentEntryForProvider(cache, provider);
    const summary = (entry?.reviewSummary ?? '').trim();
    return summary.length > 0;
}

function hasAnyProviderSummary(
    cache: Record<string, EnrichmentCacheEntry>,
    provider: MatchProvider | null
): boolean {
    if (!provider) return false;
    if (hasEnrichedSummary(cache, provider)) return true;
    return (provider.summary ?? '').trim().length > 0;
}

function hasEnrichedSummaryByPlaceId(
    cache: Record<string, EnrichmentCacheEntry>,
    placeId: string
): boolean {
    if (!placeId) return false;
    const entry =
        cache[placeId] ||
        cache[placeId.replace(/^places\//, '')] ||
        cache[`places/${placeId.replace(/^places\//, '')}`];
    const summary = (entry?.reviewSummary ?? '').trim();
    return summary.length > 0;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollEnrichment(
    placeIds: string[],
    fetchFn: (
        ids: string[]
    ) => Promise<Record<string, EnrichmentCacheEntry> | null>,
    cacheRef: { current: Record<string, EnrichmentCacheEntry> },
    onUpdate: (cache: Record<string, EnrichmentCacheEntry>) => void,
    options?: {
        maxRounds?: number;
        initialDelayMs?: number;
        signal?: AbortSignal;
        onRoundComplete?: (round: number) => void;
        onStop?: (reason: 'enriched' | 'aborted' | 'max_rounds' | 'error', rounds: number) => void;
    }
): Promise<void> {
    const { maxRounds = 5, initialDelayMs = 1000, signal, onRoundComplete, onStop } = options ?? {};
    let delay = initialDelayMs;
    let roundsCompleted = 0;

    for (let round = 0; round < maxRounds; round += 1) {
        if (signal?.aborted) {
            onStop?.('aborted', roundsCompleted);
            return;
        }
        const pending = placeIds.filter((id) => !hasEnrichedSummaryByPlaceId(cacheRef.current, id));
        if (pending.length === 0) {
            onStop?.('enriched', roundsCompleted);
            return;
        }

        await sleep(delay);
        if (signal?.aborted) {
            onStop?.('aborted', roundsCompleted);
            return;
        }

        try {
            const next = await fetchFn(pending);
            if (signal?.aborted) {
                onStop?.('aborted', roundsCompleted);
                return;
            }
            if (next) {
                const updated = { ...cacheRef.current, ...next };
                cacheRef.current = updated;
                onUpdate(updated);
                onRoundComplete?.(round);
            }
            roundsCompleted = round + 1;
        } catch (err) {
            if (signal?.aborted) {
                onStop?.('aborted', roundsCompleted);
                return;
            }
            onStop?.('error', roundsCompleted);
            console.warn('[enrichment] poll error:', err);
            return;
        }

        delay = Math.min(delay * 2, 8000);
    }
    onStop?.('max_rounds', roundsCompleted);
}

/** Keep summary concise and avoid repeating provider name at the start. */
function formatCustomerSummary(summary: string, providerName: string): string {
    if (!summary?.trim()) return summary || '';
    let text = summary.trim();
    const name = (providerName || '').trim();
    if (name) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        text = text.replace(new RegExp(`^${escaped}[\\s.,]+`, 'i'), '').trim();
    }
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length <= 5) return text;
    return sentences.slice(0, 5).join(' ').trim();
}

function providerPriorityScore(provider: MatchProvider): number {
    const rating = typeof provider.rating === 'number' ? provider.rating : 0;
    const ratingCount = typeof provider.ratingCount === 'number' ? provider.ratingCount : 0;
    const hasWebsite = Boolean(provider.website && provider.website.trim());
    const isOpen = provider.isOpen === true;
    const hasProfileContent =
        Boolean(provider.summary?.trim()) ||
        (Array.isArray(provider.specialisations) && provider.specialisations.length > 0) ||
        (provider.profileCompleteness ?? 0) >= 2;

    // Prioritise quality and confidence signals for "top recommendations".
    let score = 0;
    score += Math.min(5, rating) * 20;
    score += Math.min(200, ratingCount) * 0.35;
    score += hasWebsite ? 12 : 0;
    score += isOpen ? 10 : 0;
    score += hasProfileContent ? 8 : 0;
    return score;
}

export function MatchClient({ conversationId: initialConversationId }: { conversationId?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const pathConversationId = useMemo(() => {
        const raw = (pathname || '').split('/').filter(Boolean).pop() || '';
        if (!raw || raw.toLowerCase() === 'match') return '';
        return decodeURIComponent(raw);
    }, [pathname]);
    const conversationId =
        initialConversationId ||
        searchParams.get('conversationId') ||
        pathConversationId ||
        '';

    useEffect(() => {
        if (conversationId) setLastConversationIdForWhatsApp(conversationId);
    }, [conversationId]);

    const [isLoading, setIsLoading] = useState(true);
    const [searchRadiusKm, setSearchRadiusKm] = useState<number>(10);
    const searchRadiusMeters = searchRadiusKm * 1000;
    const {
        userLocation,
        setUserLocation,
        addressInput,
        setAddressInput,
        resolveTradeContext,
        ensureLocation,
        getCurrentCoordinates,
        reverseGeocodeLatLng,
        persistConversationLocation,
    } = useMatchConversationContext(conversationId);
    const {
        providers,
        setProviders,
        companyIndex,
        setCompanyIndex,
        isProvidersLoading,
        isLoadingMoreForExpandedRadius,
        isRefreshingProvidersInBackground,
        refreshProvidersForLocation,
    } = useMatchProviders({
        searchRadiusMeters,
        resolveTradeContext,
    });
    const [contactOpen, setContactOpen] = useState(false);
    const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
    const [isLocatingUser, setIsLocatingUser] = useState(false);
    const [reportLinkCopied, setReportLinkCopied] = useState(false);
    const [resolvedReportId, setResolvedReportId] = useState('');
    // Deduplicate provider_contact analytics per provider per session.
    const providerContactFiredForProviderIdRef = useRef<string | null>(null);

    const sortedProviders = useMemo(() => {
        return [...providers]
            .sort((a, b) => {
                const byScore = providerPriorityScore(b) - providerPriorityScore(a);
                if (byScore !== 0) return byScore;
                const byRating = (b.rating ?? 0) - (a.rating ?? 0);
                if (byRating !== 0) return byRating;
                return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
            });
    }, [providers]);
    const topProviders = useMemo(() => sortedProviders.slice(0, 5), [sortedProviders]);
    const otherProviders = useMemo(() => sortedProviders.slice(5), [sortedProviders]);
    const providerPlaceIdsKey = useMemo(
        () => providers.map((p) => p.placeId).filter(Boolean).sort().join(','),
        [providers]
    );
    const totalCompanies = topProviders.length || 1;
    const selectedProvider = useMemo(() => {
        const idx = Math.min(Math.max(companyIndex - 1, 0), Math.max(topProviders.length - 1, 0));
        return topProviders[idx] || null;
    }, [topProviders, companyIndex]);

    useEffect(() => {
        // Reset whenever the user moves to a different provider.
        providerContactFiredForProviderIdRef.current = null;
    }, [selectedProvider?.providerId]);

    const [scandioReviewCountByProviderId, setScandioReviewCountByProviderId] = useState<
        Record<string, number>
    >({});

    // Enrichment cache: keyed by Google Place ID
    const [enrichmentCache, setEnrichmentCache] = useState<Record<string, EnrichmentCacheEntry>>({});
    const [isEnrichmentLoading, setIsEnrichmentLoading] = useState(false);
    const enrichmentQueuedAtByKeyRef = useRef<Record<string, number>>({});
    const hydratedFromCacheRef = useRef(false);
    /** When sessionStorage cache had providers, skip the initial `/api/providers` fetch (avoids duplicate load). */
    const skipInitialProviderFetchRef = useRef(false);
    const skipNextAutoRefreshRef = useRef(false);
    /** After an explicit provider refresh, ignore debounced refresh briefly (avoids duplicate POST /api/providers on mount). */
    const suppressDebouncedProviderRefreshUntilRef = useRef(0);
    const providerRefreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const enrichmentCacheRef = useRef(enrichmentCache);
    enrichmentCacheRef.current = enrichmentCache;

    const bumpSuppressDebouncedProviderRefresh = useCallback(() => {
        suppressDebouncedProviderRefreshUntilRef.current = Date.now() + 450;
        if (providerRefreshDebounceTimerRef.current) {
            clearTimeout(providerRefreshDebounceTimerRef.current);
            providerRefreshDebounceTimerRef.current = null;
        }
    }, []);

    const selectedProviderHasSummary = useMemo(
        () => hasAnyProviderSummary(enrichmentCache, selectedProvider),
        [enrichmentCache, selectedProvider]
    );

    useEffect(() => {
        if (!conversationId) return;
        hydratedFromCacheRef.current = false;
        skipInitialProviderFetchRef.current = false;
        const cached = loadMatchPageCache(conversationId);
        if (!cached) return;

        hydratedFromCacheRef.current = true;
        skipInitialProviderFetchRef.current = cached.providers.length > 0;
        skipNextAutoRefreshRef.current = true;
        setSearchRadiusKm(cached.searchRadiusKm);
        setUserLocation(cached.userLocation);
        setAddressInput(cached.addressInput);
        setProviders(cached.providers);
        setCompanyIndex((prev) => {
            const maxIndex = Math.max(cached.providers.length, 1);
            const requested = cached.companyIndex || prev || 1;
            return Math.min(Math.max(requested, 1), maxIndex);
        });
        setEnrichmentCache(cached.enrichmentCache || {});
        setScandioReviewCountByProviderId(cached.scandioReviewCountByProviderId || {});
        setIsLoading(false);
    }, [conversationId, setAddressInput, setCompanyIndex, setProviders, setUserLocation]);

    useEffect(() => {
        if (!conversationId) return;
        saveMatchPageCache(conversationId, {
            providers,
            companyIndex,
            searchRadiusKm,
            userLocation,
            addressInput,
            enrichmentCache,
            scandioReviewCountByProviderId,
            savedAt: Date.now(),
        });
    }, [
        addressInput,
        companyIndex,
        conversationId,
        enrichmentCache,
        providers,
        scandioReviewCountByProviderId,
        searchRadiusKm,
        userLocation,
    ]);

    // Fire enrichment queue + fetch cache whenever the provider list changes.
    // Also poll briefly so newly enriched summaries become visible without reload.
    useEffect(() => {
        if (providers.length === 0) return;
        const providersNeedingSummary = providers.filter((p) => !hasAnyProviderSummary(enrichmentCache, p));
        const placeIds = providersNeedingSummary.map((p) => p.placeId).filter(Boolean);
        if (placeIds.length === 0) return;

        const key = placeIds.slice().sort().join(',');
        const now = Date.now();
        const lastQueuedAt = enrichmentQueuedAtByKeyRef.current[key] ?? 0;
        const QUEUE_RETRY_COOLDOWN_MS = 15_000;
        if (now - lastQueuedAt < QUEUE_RETRY_COOLDOWN_MS) return;
        enrichmentQueuedAtByKeyRef.current[key] = now;

        // 1. Fire enrichment queue (fire-and-forget)
        void resolveTradeContext().then(({ trade }) => {
            queueEnrichmentApi(placeIds, trade || undefined, {
                priorityPlaceId: selectedProvider?.placeId,
            });
        });

        // 2. Fetch existing cache entries for immediate display, then short polling.
        let cancelled = false;
        const abortController = new AbortController();
        setIsEnrichmentLoading(true);
        void (async () => {
            const mergeCache = (cache: Record<string, EnrichmentCacheEntry> | null) => {
                if (cancelled || !cache) return;
                setEnrichmentCache((prev) => {
                    const next = { ...prev, ...cache };
                    enrichmentCacheRef.current = next;
                    return next;
                });
            };

            const initial = await fetchEnrichmentApi(placeIds);
            mergeCache(initial);
            await pollEnrichment(
                placeIds,
                fetchEnrichmentApi,
                enrichmentCacheRef,
                (cache) => setEnrichmentCache({ ...cache }),
                {
                    maxRounds: 9,
                    initialDelayMs: 1000,
                    signal: abortController.signal,
                }
            );
        })().finally(() => {
            if (!cancelled) setIsEnrichmentLoading(false);
        });

        return () => {
            cancelled = true;
            abortController.abort();
        };
    }, [providerPlaceIdsKey, resolveTradeContext, selectedProvider?.placeId]);

    useEffect(() => {
        if (!selectedProvider?.placeId || selectedProviderHasSummary) return;
        let cancelled = false;
        const abortController = new AbortController();

        void (async () => {
            const trade = (await resolveTradeContext()).trade || undefined;
            queueEnrichmentApi([selectedProvider.placeId], trade, {
                priorityPlaceId: selectedProvider.placeId,
            });
            await pollEnrichment(
                [selectedProvider.placeId],
                fetchEnrichmentApi,
                enrichmentCacheRef,
                (cache) => setEnrichmentCache({ ...cache }),
                {
                    maxRounds: 6,
                    initialDelayMs: 500,
                    signal: abortController.signal,
                    onRoundComplete: (round) => {
                        if (process.env.NODE_ENV === 'development') {
                            const entry = enrichmentEntryForProvider(
                                enrichmentCacheRef.current,
                                selectedProvider
                            );
                            if ((entry?.reviewSummary ?? '').trim().length > 0) {
                                console.log(
                                    `[enrichment] selected provider enriched after ${round + 1} round(s)`
                                );
                            }
                        }
                    },
                    onStop: (reason, rounds) => {
                        if (process.env.NODE_ENV !== 'development') return;
                        console.log(
                            `[enrichment] selected provider polling stopped: ${reason} after ${rounds} round(s)`
                        );
                    },
                }
            );
        })();

        return () => {
            cancelled = true;
            abortController.abort();
        };
    }, [
        resolveTradeContext,
        selectedProvider?.placeId,
        selectedProvider?.providerId,
        selectedProviderHasSummary,
    ]);

    useEffect(() => {
        const pid = selectedProvider?.providerId;
        if (!pid) return;
        if (typeof selectedProvider?.scandioReviewCount === 'number') return;
        if (Object.prototype.hasOwnProperty.call(scandioReviewCountByProviderId, pid)) return;

        let cancelled = false;
        void (async () => {
            try {
                const data = await reviewsCountApi(pid);
                if (cancelled) return;
                const count = typeof data?.scandioReviewCount === 'number' ? data.scandioReviewCount : 0;
                setScandioReviewCountByProviderId((prev) => ({ ...prev, [pid]: count }));
            } catch {
                if (cancelled) return;
                setScandioReviewCountByProviderId((prev) => ({ ...prev, [pid]: 0 }));
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selectedProvider?.providerId, scandioReviewCountByProviderId]);

    const lastProvidersErrorToastAtRef = useRef<number>(0);
    const { mapHostRef } = useMatchMap({
        userLocation,
        providers,
        searchRadiusMeters,
        onMarkerClick: (placeId) => {
            const idx = topProviders.findIndex((p) => p.placeId === placeId);
            if (idx >= 0) setCompanyIndex(idx + 1);
        },
    });

    useEffect(() => {
        if (topProviders.length === 0) return;
        setCompanyIndex((prev) => Math.min(Math.max(prev, 1), topProviders.length));
    }, [topProviders.length, setCompanyIndex]);


    const googleMapsLink = useMemo(() => {
        if (!userLocation) return '';
        const q = `${userLocation.lat},${userLocation.lng}`;
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }, [userLocation]);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const candidates = Array.from(
                new Set(
                    [
                        conversationId,
                        searchParams.get('reportId') || '',
                        searchParams.get('id') || '',
                        searchParams.get('conversationId') || '',
                    ]
                        .map((v) => v.trim())
                        .filter(Boolean)
                )
            );
            if (candidates.length === 0) {
                if (!cancelled) setResolvedReportId('');
                return;
            }

            for (const candidate of candidates) {
                const result = await fetchConversationDiagnosis(candidate);
                if (cancelled) return;
                if (result.ok && result.data) {
                    setResolvedReportId(candidate);
                    return;
                }
            }

            if (!cancelled) setResolvedReportId(candidates[0] ?? '');
        })();
        return () => {
            cancelled = true;
        };
    }, [conversationId, searchParams]);
    const reportPath = useMemo(() => {
        if (!resolvedReportId) return '';
        return `/report/${encodeURIComponent(resolvedReportId)}`;
    }, [resolvedReportId]);
    const reportUrl = useMemo(() => {
        if (!reportPath) return '';
        if (typeof window === 'undefined') return reportPath;
        return `${window.location.origin}${reportPath}`;
    }, [reportPath]);
    const fetchProviders = useCallback(async () => {
        const loc = await ensureLocation();
        if (!loc) return;
        await refreshProvidersForLocation(loc);
        bumpSuppressDebouncedProviderRefresh();
    }, [bumpSuppressDebouncedProviderRefresh, ensureLocation, refreshProvidersForLocation]);

    const updateLocationFromAddress = useCallback(
        async (address: string) => {
            if (!conversationId) return;
            const trimmed = address.trim();
            if (!trimmed) return;

            setIsUpdatingLocation(true);
            setIsLoading(true);
            setProviders([]);
            setCompanyIndex(1);

            try {
                const coordMatch = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
                const isCoords = Boolean(coordMatch);

                const geo = await geocodeApi(
                    isCoords
                        ? { lat: Number(coordMatch?.[1]), lng: Number(coordMatch?.[2]) }
                        : { address: trimmed }
                );

                if (
                    !geo ||
                    typeof geo.lat !== 'number' ||
                    typeof geo.lng !== 'number' ||
                    !Number.isFinite(geo.lat) ||
                    !Number.isFinite(geo.lng) ||
                    (typeof geo.address !== 'string' && typeof geo.address !== 'undefined')
                ) {
                    toast.error(
                        geo?.error ||
                            'We could not find that address. Try street and suburb, for example "12 Main Road, Claremont".'
                    );
                    return;
                }

                const loc = {
                    lat: geo.lat as number,
                    lng: geo.lng as number,
                    address: typeof geo.address === 'string' ? geo.address : trimmed,
                };

                setUserLocation(loc);
                setAddressInput(loc.address);

                await persistConversationLocation(loc);

                await refreshProvidersForLocation(loc);
                bumpSuppressDebouncedProviderRefresh();
            } finally {
                setIsUpdatingLocation(false);
                setIsLoading(false);
            }
        },
        [bumpSuppressDebouncedProviderRefresh, conversationId, persistConversationLocation, refreshProvidersForLocation]
    );

    const handleUseCurrentLocation = useCallback(async () => {
        setIsLocatingUser(true);
        setIsLoading(true);
        try {
            const coords = await getCurrentCoordinates();
            if (!coords) {
                toast.error('Could not access your location. Please allow permission and try again.');
                return;
            }
            const resolvedAddress = await reverseGeocodeLatLng(coords.lat, coords.lng);
            const formattedAddress = resolvedAddress || `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
            const loc = { lat: coords.lat, lng: coords.lng, address: formattedAddress };
            setUserLocation(loc);
            setAddressInput(formattedAddress);
            await persistConversationLocation(loc);
            await refreshProvidersForLocation(loc);
            bumpSuppressDebouncedProviderRefresh();
        } finally {
            setIsLocatingUser(false);
            setIsLoading(false);
        }
    }, [
        bumpSuppressDebouncedProviderRefresh,
        getCurrentCoordinates,
        persistConversationLocation,
        refreshProvidersForLocation,
        reverseGeocodeLatLng,
        setAddressInput,
        setUserLocation,
    ]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (skipInitialProviderFetchRef.current) {
                skipInitialProviderFetchRef.current = false;
                return;
            }
            setIsLoading(true);
            try {
                await fetchProviders();
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [conversationId, fetchProviders]);

    useEffect(() => {
        if (!userLocation) return;
        setAddressInput(userLocation.address || `${userLocation.lat}, ${userLocation.lng}`);
    }, [userLocation]);

    // Debounce radius/location changes so rapid badge clicks settle before firing.
    useEffect(() => {
        if (!userLocation) return;
        if (isUpdatingLocation) return;
        if (skipNextAutoRefreshRef.current) {
            skipNextAutoRefreshRef.current = false;
            return;
        }
        const timer = setTimeout(() => {
            if (Date.now() < suppressDebouncedProviderRefreshUntilRef.current) return;
            void refreshProvidersForLocation(userLocation);
        }, 300);
        providerRefreshDebounceTimerRef.current = timer;
        return () => {
            clearTimeout(timer);
            if (providerRefreshDebounceTimerRef.current === timer) {
                providerRefreshDebounceTimerRef.current = null;
            }
        };
    }, [isUpdatingLocation, refreshProvidersForLocation, searchRadiusMeters, userLocation]);

    const goPrev = () => setCompanyIndex((v) => Math.max(1, v - 1));
    const goNext = () => setCompanyIndex((v) => Math.min(totalCompanies, v + 1));

    const focusAddressSearch = useCallback(() => {
        const el = document.getElementById('match-address-input');
        if (el instanceof HTMLInputElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.setTimeout(() => el.focus(), 250);
        }
    }, []);

    // Keep current providers visible while we fetch more (e.g. radius expansion).
    const showBottomSkeleton = (isLoading || isProvidersLoading) && providers.length === 0;
    const noProviders = !showBottomSkeleton && providers.length === 0;
    // Fire match_view once when providers first load.
    const matchViewFiredRef = useRef(false);
    useEffect(() => {
        if (!matchViewFiredRef.current && providers.length > 0) {
            matchViewFiredRef.current = true;
            trackEvent('match_view', { diagnosis_id: conversationId || undefined });
        }
    }, [providers.length, conversationId]);

    const trackContactIntent = useCallback(
        (channel: 'phone' | 'email' | 'whatsapp') => {
            if (!conversationId || !selectedProvider?.providerId) return;
            if (providerContactFiredForProviderIdRef.current !== selectedProvider.providerId) {
                providerContactFiredForProviderIdRef.current = selectedProvider.providerId;
                trackEvent('provider_contact', {
                    provider_id: selectedProvider.providerId,
                    diagnosis_id: conversationId,
                });
            }
            void restoreProviderTokenApi({
                providerId: selectedProvider.providerId,
                conversationId,
                channel,
            });
        },
        [conversationId, selectedProvider?.providerId]
    );

    const trackProviderContactOnceOnOpen = useCallback(() => {
        if (!conversationId || !selectedProvider?.providerId) return;
        if (providerContactFiredForProviderIdRef.current === selectedProvider.providerId) return;
        providerContactFiredForProviderIdRef.current = selectedProvider.providerId;
        trackEvent('provider_contact', {
            provider_id: selectedProvider.providerId,
            diagnosis_id: conversationId,
        });
    }, [conversationId, selectedProvider?.providerId]);

    const openProviderDetails = useCallback(async (targetProvider: MatchProvider | null) => {
        if (!targetProvider?.providerId) return;
        // Track when a user actually opens provider details.
        trackEvent('provider_profile_view', {
            provider_id: targetProvider.providerId,
            diagnosis_id: conversationId,
        });
        if (!hasEnrichedSummary(enrichmentCache, targetProvider)) {
            const { trade } = await resolveTradeContext();
            queueEnrichmentApi([targetProvider.placeId], trade || undefined);
        }
        const cid = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
        router.push(`/pro/${encodeURIComponent(targetProvider.providerId)}${cid}`);
    }, [conversationId, enrichmentCache, resolveTradeContext, router]);

    const handleOpenReportInNewTab = useCallback(() => {
        if (!reportPath) return;
        window.open(reportPath, '_blank', 'noopener,noreferrer');
    }, [reportPath]);

    const handleCopyReportLink = useCallback(async () => {
        if (!reportUrl) return;
        try {
            await navigator.clipboard.writeText(reportUrl);
            setReportLinkCopied(true);
            toast.success('Scandio report link copied');
            window.setTimeout(() => setReportLinkCopied(false), 2000);
        } catch {
            toast.error('Could not copy report link');
        }
    }, [reportUrl]);

    return (
        <main className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={3} onBack={() => router.back()} />
            <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-4 pt-20 sm:px-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-semibold text-foreground">Header Name</h1>
                    <p className="text-sm text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                    </p>
                </div>

                <div className="relative h-52 w-full overflow-hidden rounded-lg bg-secondary">
                    <div ref={mapHostRef} className="absolute inset-0 h-full w-full rounded-lg" />
                    {!userLocation || isLoading ? (
                        <p className="relative z-10 flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
                            {isLoading ? 'Finding Service Providers...' : null}
                        </p>
                    ) : null}
                </div>

                {reportPath ? (
                    <div className="flex items-center justify-between rounded-lg border border-input bg-card p-3">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">Scandio Scan</p>
                            <p className="truncate text-xs text-muted-foreground">Open or copy your diagnosis link</p>
                        </div>
                        <div className="ml-3 flex shrink-0 items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-9 w-9"
                                onClick={handleOpenReportInNewTab}
                                aria-label="Open Scandio scan in new tab"
                            >
                                <ExternalLink className="size-4" aria-hidden />
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => {
                                    void handleCopyReportLink();
                                }}
                                aria-label="Copy Scandio scan link"
                            >
                                {reportLinkCopied ? (
                                    <Check className="size-4" aria-hidden />
                                ) : (
                                    <Copy className="size-4" aria-hidden />
                                )}
                            </Button>
                        </div>
                    </div>
                ) : null}

                {showBottomSkeleton ? (
                    <div className="flex flex-row items-center justify-between gap-4 truncate">
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                ) : selectedProvider ? (
                    <div className="flex flex-row items-center justify-between gap-4 truncate">
                        <p className="truncate text-sm">
                            {formatProviderAddress(selectedProvider.address) || 'Address not available'}
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Car className="size-4" aria-hidden="true" />
                            {selectedProvider.durationText
                                ? selectedProvider.durationText.replace(/\bmin\b/gi, 'Minutes')
                                : 'Not available'}
                        </span>
                    </div>
                ) : null}

                <div className="space-y-4 rounded-lg border border-input bg-card p-4">
                    <div className="relative">
                        <Input
                            id="match-address-input"
                            placeholder="Enter your address"
                            className="h-10 pr-11 text-sm"
                            value={addressInput}
                            onChange={(e) => setAddressInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                void updateLocationFromAddress(addressInput);
                            }}
                            disabled={isUpdatingLocation || isLoading}
                        />
                        <button
                            type="button"
                            aria-label="Use current location"
                            className="absolute inset-y-0 right-1 my-1 inline-flex w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                            disabled={isUpdatingLocation || isLoading || isLocatingUser}
                            onClick={() => {
                                void handleUseCurrentLocation();
                            }}
                        >
                            {isLocatingUser ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <LocateFixed className="size-4" />
                            )}
                        </button>
                    </div>
                    <div className="flex flex-row items-center justify-between">
                        <label className="text-sm font-medium text-foreground">Search Radius</label>
                        <div className="flex flex-row items-center gap-2 overflow-x-auto">
                            {RADIUS_OPTIONS_KM.map((km) => {
                                const isActive = searchRadiusKm === km;
                                return (
                                    <Badge
                                        key={km}
                                        variant={isActive ? 'default' : 'secondary'}
                                        className="shrink-0 cursor-pointer rounded-full"
                                        role="button"
                                        aria-pressed={isActive}
                                        onClick={() => setSearchRadiusKm(km)}
                                    >
                                        {km} km
                                    </Badge>
                                );
                            })}
                        </div>
                    </div>
                    {!showBottomSkeleton && isLoadingMoreForExpandedRadius ? (
                        <p className="text-xs text-muted-foreground">
                            Expanding your search radius and loading more contractors...
                        </p>
                    ) : !showBottomSkeleton && isRefreshingProvidersInBackground ? (
                        <p className="text-xs text-muted-foreground">Refreshing recommendations...</p>
                    ) : null}
                </div>

                <div className="flex flex-col gap-4">
                <div
                    className={
                        noProviders
                            ? 'flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4'
                            : 'flex flex-row justify-between items-center'
                    }
                >
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold text-foregroundimage.png">Top Recommendations</h3>
                        {noProviders ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                                We couldn&apos;t find matching contractors for this location yet.
                            </p>
                        ) : null}
                    </div>
                    {!noProviders ? (
                        <div className="flex flex-row gap-2 shrink-0">
                            <Button
                                variant="secondary"
                                className="h-10 w-10"
                                aria-label="Previous Company"
                                onClick={goPrev}
                                disabled={showBottomSkeleton || companyIndex === 1}
                            >
                                {showBottomSkeleton ? <Skeleton className="h-4 w-4" /> : <ArrowLeft className="size-5" aria-hidden="true" />}
                            </Button>
                            <Button
                                variant="secondary"
                                className="h-10 w-10"
                                aria-label="Next Company"
                                onClick={goNext}
                                disabled={showBottomSkeleton || companyIndex === totalCompanies}
                            >
                                {showBottomSkeleton ? <Skeleton className="h-4 w-4" /> : <ArrowRight className="size-5" aria-hidden="true" />}
                            </Button>
                        </div>
                    ) : null}
                </div>
                {showBottomSkeleton ? (
                <div className="flex flex-col gap-4 p-4 border border-input rounded-lg bg-card">
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <Skeleton className="h-6 w-56" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                            <div className="flex flex-row gap-2">
                                <Skeleton className="flex-1 h-10" />
                                <Skeleton className="flex-1 h-10" />
                            </div>
                        </div>
                </div>
                    ) : noProviders ? (
                        <MatchNoProvidersEmpty onEditAddress={focusAddressSearch} />
                    ) : (
                <div className="flex flex-col gap-4 p-4 border border-input rounded-lg bg-card">
                        <>
                            <div className="flex flex-col gap-2">
                                <h3 className="text-lg text-foreground font-bold truncate">
                                    {selectedProvider?.name}
                                </h3>
                                <div className="flex flex-row items-center gap-2">
                                    <Star className="size-5 text-yellow-500 fill-yellow-500" aria-hidden="true" />
                                    <p className="text-sm text-foreground font-bold">
                                        {selectedProvider?.rating != null ? selectedProvider.rating.toFixed(1) : 'Not available'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {(() => {
                                            const pid = selectedProvider?.providerId;
                                            const scandioCountFromProvider =
                                                typeof selectedProvider?.scandioReviewCount === 'number'
                                                    ? selectedProvider.scandioReviewCount
                                                    : 0;
                                            const scandioCountFromMap =
                                                pid && typeof scandioReviewCountByProviderId[pid] === 'number'
                                                    ? scandioReviewCountByProviderId[pid]
                                                    : 0;
                                            const scandioCount = scandioCountFromProvider || scandioCountFromMap;
                                            const googleCount = selectedProvider?.ratingCount ?? 0;
                                            return `(${googleCount + scandioCount} reviews)`;
                                        })()}
                                    </p>
                                    {typeof selectedProvider?.isOpen === 'boolean' ? (
                                        <Badge
                                            variant="secondary"
                                        >
                                            {selectedProvider.isOpen ? 'Open' : 'Closed'}
                                        </Badge>
                                    ) : null}
                                </div>
                            </div>

                            {(() => {
                                if (!selectedProvider) return null;
                                const enrich = enrichmentEntryForProvider(
                                    enrichmentCache,
                                    selectedProvider
                                );
                                const scandioSummary = (enrich?.reviewSummary ?? '').trim();
                                const fallbackSummary = (selectedProvider.summary ?? '').trim();
                                const displaySummary = formatCustomerSummary(
                                    scandioSummary || fallbackSummary,
                                    selectedProvider.name
                                );
                                const shouldShowSummarySkeleton = !displaySummary && isEnrichmentLoading;
                                const pendingText = isEnrichmentLoading
                                    ? 'Scandio summary is being prepared now.'
                                    : 'No customer summary available yet.';

                                return (
                                    <div className="flex flex-col gap-1">
                                        {shouldShowSummarySkeleton ? (
                                            <div className="flex flex-col gap-2">
                                                <Skeleton className="h-4 w-full" />
                                                <Skeleton className="h-4 w-11/12" />
                                                <Skeleton className="h-4 w-5/6" />
                                            </div>
                                        ) : (
                                            <p
                                                className="text-sm text-muted-foreground"
                                                style={{
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 4 as any,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {displaySummary || pendingText}
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}

                            <div className="flex flex-row gap-2">
                                <Popover
                                    open={contactOpen}
                                    onOpenChange={(open) => {
                                        setContactOpen(open);
                                        if (open) trackProviderContactOnceOnOpen();
                                    }}
                                >
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="default"
                                            className="flex flex-1 h-10"
                                            disabled={!selectedProvider}
                                        >
                                            Contact Contractor
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        className="w-64 p-3 rounded-md shadow-xl border-input"
                                        align="start"
                                        side="top"
                                        sideOffset={4}
                                    >
                                        <div className="flex flex-col gap-3">
                                            <Button
                                                variant="secondary"
                                                className="w-full"
                                                onClick={() => {
                                                    const phone = toWhatsAppPhone(selectedProvider?.phone);
                                                    if (phone) {
                                                        trackContactIntent('whatsapp');
                                                        window.open(
                                                            `https://wa.me/${phone}`,
                                                            '_blank',
                                                            'noopener,noreferrer'
                                                        );
                                                    }
                                                    setContactOpen(false);
                                                }}
                                                disabled={!toWhatsAppPhone(selectedProvider?.phone)}
                                            >
                                                WhatsApp
                                            </Button>
                                            <p className="text-xs text-muted-foreground text-center">
                                                Start on WhatsApp, call them, or send an email.
                                            </p>
                                            <div className="flex flex-row gap-2">
                                                <Button
                                                    variant="ghost"
                                                    className="flex-1 h-10"
                                                    onClick={() => {
                                                        if (selectedProvider?.phone) {
                                                            trackContactIntent('phone');
                                                            window.location.href = `tel:${selectedProvider.phone}`;
                                                        }
                                                        setContactOpen(false);
                                                    }}
                                                    disabled={!selectedProvider?.phone}
                                                >
                                                    Phone
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    className="flex-1 h-10"
                                                    onClick={() => {
                                                        if (selectedProvider?.website) {
                                                            trackContactIntent('email');
                                                            window.location.href = `mailto:${selectedProvider.website}`;
                                                        }
                                                        setContactOpen(false);
                                                    }}
                                                    disabled={!selectedProvider?.website}
                                                >
                                                    Email
                                                </Button>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <Button
                                    variant="ghost"
                                    className="flex flex-1 h-10"
                                    onClick={() => {
                                        void openProviderDetails(selectedProvider);
                                    }}
                                    disabled={!selectedProvider?.providerId}
                                >
                                    View Profile
                                </Button>
                            </div>
                        </>
                </div>
                    )}

                {!showBottomSkeleton && otherProviders.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Other recommendations</h3>
                        <div>
                            <div className="flex flex-col gap-2 pr-1">
                                {otherProviders.map((provider) => (
                                    <div
                                        key={provider.placeId}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-input bg-card px-3 py-2.5"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">{provider.name}</p>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="inline-flex items-center gap-1">
                                                    <Star className="size-3.5 fill-yellow-500 text-yellow-500" aria-hidden="true" />
                                                    {provider.rating != null ? provider.rating.toFixed(1) : '—'}
                                                </span>
                                                <span>
                                                    {(provider.ratingCount ?? 0) +
                                                        (typeof provider.scandioReviewCount === 'number'
                                                            ? provider.scandioReviewCount
                                                            : 0)} reviews
                                                </span>
                                                {typeof provider.isOpen === 'boolean' ? (
                                                    <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                                        {provider.isOpen ? 'Open' : 'Closed'}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            className="h-8 shrink-0 px-3"
                                            onClick={() => {
                                                void openProviderDetails(provider);
                                            }}
                                            disabled={!provider.providerId}
                                        >
                                            View
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
                </div>
                </div>
        </main>
    );
}

