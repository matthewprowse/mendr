'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toWhatsAppPhone } from '@/lib/utils';
import { setLastConversationIdForWhatsApp } from '@/lib/whatsapp-prefill';
import { ArrowLeft, ArrowRight, Car, Loader2, Star } from 'lucide-react';
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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

export function MatchClient({ conversationId: initialConversationId }: { conversationId?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const conversationId = initialConversationId || searchParams.get('conversationId') || '';

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
        persistConversationLocation,
    } = useMatchConversationContext(conversationId);
    const {
        providers,
        setProviders,
        companyIndex,
        setCompanyIndex,
        isProvidersLoading,
        isLoadingMoreForExpandedRadius,
        refreshProvidersForLocation,
    } = useMatchProviders({
        searchRadiusMeters,
        resolveTradeContext,
    });
    const totalCompanies = providers.length || 1;
    const [contactOpen, setContactOpen] = useState(false);
    const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

    const selectedProvider = useMemo(() => {
        const idx = Math.min(Math.max(companyIndex - 1, 0), Math.max(providers.length - 1, 0));
        return providers[idx] || null;
    }, [providers, companyIndex]);

    const [scandioReviewCountByProviderId, setScandioReviewCountByProviderId] = useState<
        Record<string, number>
    >({});

    // Enrichment cache: keyed by Google Place ID
    const [enrichmentCache, setEnrichmentCache] = useState<Record<string, EnrichmentCacheEntry>>({});
    const [isEnrichmentLoading, setIsEnrichmentLoading] = useState(false);
    const [isDetailsWaiting, setIsDetailsWaiting] = useState(false);
    const [detailsWaitingProviderName, setDetailsWaitingProviderName] = useState<string>('');
    const enrichmentQueuedRef = useRef<string>('');
    const hydratedFromCacheRef = useRef(false);
    const skipNextAutoRefreshRef = useRef(false);

    useEffect(() => {
        if (!conversationId) return;
        const cached = loadMatchPageCache(conversationId);
        if (!cached) return;

        hydratedFromCacheRef.current = true;
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
        const placeIds = providers.map((p) => p.placeId).filter(Boolean);
        if (placeIds.length === 0) return;

        const key = placeIds.slice().sort().join(',');
        if (enrichmentQueuedRef.current === key) return;
        enrichmentQueuedRef.current = key;

        // 1. Fire enrichment queue (fire-and-forget)
        void resolveTradeContext().then(({ trade }) => {
            queueEnrichmentApi(placeIds, trade || undefined);
        });

        // 2. Fetch existing cache entries for immediate display, then short polling.
        let cancelled = false;
        setIsEnrichmentLoading(true);
        void (async () => {
            const mergeCache = (cache: Record<string, EnrichmentCacheEntry> | null) => {
                if (cancelled || !cache) return;
                setEnrichmentCache((prev) => ({ ...prev, ...cache }));
            };

            const initial = await fetchEnrichmentApi(placeIds);
            mergeCache(initial);

            const MAX_POLL_ROUNDS = 10;
            for (let round = 0; round < MAX_POLL_ROUNDS; round += 1) {
                if (cancelled) break;
                await sleep(2000);
                if (cancelled) break;
                const pendingProviders = providers.filter(
                    (p) => !hasEnrichedSummary(enrichmentCache, p)
                );
                if (pendingProviders.length === 0) break;
                const pendingIds = pendingProviders.map((p) => p.placeId).filter(Boolean);
                if (pendingIds.length === 0) break;
                const next = await fetchEnrichmentApi(pendingIds);
                mergeCache(next);
            }
        })().finally(() => {
            if (!cancelled) setIsEnrichmentLoading(false);
        });

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [providers, enrichmentCache]);

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
            const idx = providers.findIndex((p) => p.placeId === placeId);
            if (idx >= 0) setCompanyIndex(idx + 1);
        },
    });

    const googleMapsLink = useMemo(() => {
        if (!userLocation) return '';
        const q = `${userLocation.lat},${userLocation.lng}`;
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }, [userLocation]);
    const fetchProviders = useCallback(async () => {
        const loc = await ensureLocation();
        if (!loc) return;
        await refreshProvidersForLocation(loc);
    }, [ensureLocation, refreshProvidersForLocation]);

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
            } finally {
                setIsUpdatingLocation(false);
                setIsLoading(false);
            }
        },
        [conversationId, refreshProvidersForLocation]
    );

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (hydratedFromCacheRef.current && providers.length > 0) {
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
    }, [fetchProviders, providers.length]);

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
            void refreshProvidersForLocation(userLocation);
        }, 300);
        return () => clearTimeout(timer);
    }, [isUpdatingLocation, refreshProvidersForLocation, searchRadiusMeters, userLocation]);

    const goPrev = () => setCompanyIndex((v) => Math.max(1, v - 1));
    const goNext = () => setCompanyIndex((v) => Math.min(totalCompanies, v + 1));

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
            trackEvent('provider_contact', {
                provider_id: selectedProvider.providerId,
                diagnosis_id: conversationId,
            });
            void restoreProviderTokenApi({
                providerId: selectedProvider.providerId,
                conversationId,
                channel,
            });
        },
        [conversationId, selectedProvider?.providerId]
    );

    const openProviderDetails = useCallback(async () => {
        if (!selectedProvider?.providerId) return;
        const alreadyEnriched = hasEnrichedSummary(enrichmentCache, selectedProvider);
        if (alreadyEnriched) {
            router.push(`/pro/${encodeURIComponent(selectedProvider.providerId)}`);
            return;
        }

        setDetailsWaitingProviderName(selectedProvider.name || 'this provider');
        setIsDetailsWaiting(true);
        try {
            queueEnrichmentApi([selectedProvider.placeId], (await resolveTradeContext()).trade || undefined);
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const cache = await fetchEnrichmentApi([selectedProvider.placeId]);
                if (cache) {
                    setEnrichmentCache((prev) => ({ ...prev, ...cache }));
                    const refreshedProvider = {
                        ...selectedProvider,
                    };
                    if (hasEnrichedSummary({ ...enrichmentCache, ...cache }, refreshedProvider)) {
                        router.push(`/pro/${encodeURIComponent(selectedProvider.providerId)}`);
                        return;
                    }
                }
                await sleep(1500);
            }
            toast.message('We are still preparing this profile. Please try again in a moment.');
        } finally {
            setIsDetailsWaiting(false);
        }
    }, [enrichmentCache, resolveTradeContext, router, selectedProvider]);

    if (isDetailsWaiting) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
                <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">
                        Preparing Contractor Details
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        We are still preparing details for {detailsWaitingProviderName}. This can take a few seconds.
                    </p>
                </div>
                <Button variant="secondary" onClick={() => setIsDetailsWaiting(false)}>
                    Back to Matches
                </Button>
            </main>
        );
    }

    return (
        <main className="flex flex-col h-dvh pt-16">
            <FlowStepHeader step={3} onBack={() => router.back()} />

            <div className="flex flex-col gap-4 px-4 pt-4 flex-1 min-h-0 mb-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">
                        Vetted Contractors Near You
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        These contractors match your Scandio Report and are close to your address.
                    </p>
                </div>

                <Input
                    placeholder="Enter your address"
                    className="text-sm h-10 mt-3"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        void updateLocationFromAddress(addressInput);
                    }}
                    disabled={isUpdatingLocation || isLoading}
                />

                <div className="flex flex-row justify-between items-center mb-3">
                    <label className="text-sm text-foreground font-medium">Search Radius</label>
                    <div className="flex flex-row items-center gap-2 overflow-x-auto">
                        {RADIUS_OPTIONS_KM.map((km) => {
                            const isActive = searchRadiusKm === km;
                            return (
                                <Badge
                                    key={km}
                                    variant={isActive ? 'default' : 'secondary'}
                                    className="shrink-0 rounded-full cursor-pointer"
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
                    <p className="text-xs text-muted-foreground -mt-1">
                        Expanding your search radius and loading more contractors...
                    </p>
                ) : null}

                <div className="relative flex flex-col flex-1 text-center px-4 items-center justify-center bg-secondary rounded-lg w-full overflow-hidden">
                    <div ref={mapHostRef} className="absolute inset-0 w-full h-full rounded-lg" />
                    {!userLocation || isLoading ? (
                        <p className="relative z-10 text-xs text-muted-foreground">
                            {isLoading ? 'Finding nearby contractors...' : null}
                        </p>
                    ) : null}
                </div>

                {showBottomSkeleton ? (
                    <div className="flex flex-row gap-4 items-center justify-between truncate">
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                ) : selectedProvider ? (
                    <div className="flex flex-row gap-4 items-center justify-between truncate">
                        <p className="text-sm truncate">
                            {formatProviderAddress(selectedProvider.address) || 'Address not available'}
                        </p>
                        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                            <Car className="size-4" aria-hidden="true" />
                            {selectedProvider.durationText
                                ? selectedProvider.durationText.replace(/\bmin\b/gi, 'Minutes')
                                : 'Not available'}
                        </span>
                    </div>
                ) : null}
            </div>

            <div className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] w-full sticky bottom-0 z-40">
                <div className="flex flex-row justify-between items-center">
                    <Badge variant="secondary">
                        {showBottomSkeleton ? (
                            <Skeleton className="h-4 w-24" />
                        ) : noProviders ? (
                            '0 / 0'
                        ) : (
                            `${companyIndex} / ${totalCompanies}`
                        )}
                    </Badge>
                    <div className="flex flex-row gap-2">
                        <Button
                            variant="secondary"
                            className="h-10 w-10"
                            aria-label="Previous contractor"
                            onClick={goPrev}
                            disabled={showBottomSkeleton || companyIndex === 1}
                        >
                            {showBottomSkeleton ? <Skeleton className="h-4 w-4" /> : <ArrowLeft className="size-5" aria-hidden="true" />}
                        </Button>
                        <Button
                            variant="secondary"
                            className="h-10 w-10"
                            aria-label="Next contractor"
                            onClick={goNext}
                            disabled={showBottomSkeleton || companyIndex === totalCompanies}
                        >
                            {showBottomSkeleton ? <Skeleton className="h-4 w-4" /> : <ArrowRight className="size-5" aria-hidden="true" />}
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col gap-4 p-4 border border-input rounded-lg">
                    {showBottomSkeleton ? (
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
                    ) : noProviders ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <h3 className="text-lg text-foreground font-bold truncate">No contractors found nearby</h3>
                                <p className="text-sm text-muted-foreground">
                                    Try updating your address and we will pull a fresh set of contractors.
                                </p>
                            </div>
                            <div className="flex flex-row gap-2">
                                <Button variant="default" className="flex flex-1 h-10" disabled>
                                    Contact Contractor
                                </Button>
                                <Button variant="ghost" className="flex flex-1 h-10" disabled>
                                    View Profile
                                </Button>
                            </div>
                        </div>
                    ) : (
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
                                const pendingText = isEnrichmentLoading
                                    ? 'Scandio summary is being prepared now.'
                                    : 'Scandio summary will appear once ready.';

                                return (
                                    <div className="flex flex-col gap-1">
                                        <p className="text-sm text-foreground font-medium">
                                            Why Scandio Matched Them
                                        </p>
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
                                    </div>
                                );
                            })()}

                            <div className="flex flex-row gap-2">
                                <Popover open={contactOpen} onOpenChange={setContactOpen}>
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
                                        void openProviderDetails();
                                    }}
                                    disabled={!selectedProvider?.providerId}
                                >
                                    View Profile
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

