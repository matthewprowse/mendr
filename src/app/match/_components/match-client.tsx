'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toWhatsAppPhone } from '@/lib/utils';
import { setLastConversationIdForWhatsApp } from '@/lib/whatsapp-prefill';
import { ArrowLeft, ArrowRight, Star } from 'lucide-react';
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
import { ReportCard } from '@/app/chat/_components/report-card';
import type { EnrichmentCacheEntry } from '@/app/api/enrich/get/route';
import { useMatchConversationContext } from '@/features/match/hooks/useMatchConversationContext';
import { useMatchProviders } from '@/features/match/hooks/useMatchProviders';
import { useMatchMap } from '@/features/match/hooks/useMatchMap';

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

function profileCompletenessLabel(level: number): string {
    if (level >= 3) return 'Verified Profile';
    if (level >= 2) return 'Detailed Profile';
    if (level >= 1) return 'Basic Profile';
    return 'Listing Profile';
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
    const enrichmentQueuedRef = useRef<string>('');

    // Fire enrichment queue + fetch cache whenever the provider list changes
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

        // 2. Fetch existing cache entries for immediate display
        let cancelled = false;
        setIsEnrichmentLoading(true);
        void fetchEnrichmentApi(placeIds).then((cache) => {
            if (cancelled) return;
            if (cache) setEnrichmentCache((prev) => ({ ...prev, ...cache }));
        }).finally(() => {
            if (!cancelled) setIsEnrichmentLoading(false);
        });

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [providers]);

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
                    toast.error(geo?.error || 'Failed to find that address');
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
    }, [fetchProviders]);

    useEffect(() => {
        if (!userLocation) return;
        setAddressInput(userLocation.address || `${userLocation.lat}, ${userLocation.lng}`);
    }, [userLocation]);

    // Debounce radius/location changes — rapid badge clicks settle before firing.
    useEffect(() => {
        if (!userLocation) return;
        if (isUpdatingLocation) return;
        const timer = setTimeout(() => {
            void refreshProvidersForLocation(userLocation);
        }, 300);
        return () => clearTimeout(timer);
    }, [isUpdatingLocation, refreshProvidersForLocation, searchRadiusMeters, userLocation]);

    const goPrev = () => setCompanyIndex((v) => Math.max(1, v - 1));
    const goNext = () => setCompanyIndex((v) => Math.min(totalCompanies, v + 1));

    const showBottomSkeleton = isLoading || isProvidersLoading;
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

    return (
        <main className="flex flex-col h-dvh pt-16">
            <FlowStepHeader step={3} onBack={() => router.back()} />

            <div className="flex flex-col gap-4 px-4 pt-4 flex-1 min-h-0 mb-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold text-foreground">
                        Recommended Matches
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Top-rated providers near you, matched to your diagnosis.
                    </p>
                </div>

                <Input
                    placeholder="Enter Address"
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
                    <label className="text-sm text-foreground font-medium">Service Radius</label>
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

                <div className="relative flex flex-col flex-1 text-center px-4 items-center justify-center bg-secondary rounded-lg w-full overflow-hidden">
                    <div ref={mapHostRef} className="absolute inset-0 w-full h-full rounded-lg" />
                    {!userLocation || isLoading ? (
                        <p className="relative z-10 text-xs text-muted-foreground">
                            {isLoading ? 'Finding Nearby Providers...' : null}
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
                            {formatProviderAddress(selectedProvider.address) || 'Address Not Available'}
                        </p>
                        <span className="text-sm text-muted-foreground">
                            {selectedProvider.durationText
                                ? selectedProvider.durationText.replace(/\bmin\b/gi, 'Minutes')
                                : '—'}
                        </span>
                    </div>
                ) : null}
            </div>

            <div className="flex flex-col gap-4 p-4 w-full sticky bottom-0 z-40">
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
                            aria-label="Previous Provider"
                            onClick={goPrev}
                            disabled={showBottomSkeleton || companyIndex === 1}
                        >
                            {showBottomSkeleton ? <Skeleton className="h-4 w-4" /> : <ArrowLeft className="size-5" aria-hidden="true" />}
                        </Button>
                        <Button
                            variant="secondary"
                            className="h-10 w-10"
                            aria-label="Next Provider"
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
                                <h3 className="text-lg text-foreground font-bold truncate">No matches nearby</h3>
                                <p className="text-sm text-muted-foreground">
                                    Try adjusting your address and we&apos;ll pull a fresh set of providers.
                                </p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm text-foreground font-medium">Scandio Summary</p>
                                <p className="text-sm text-muted-foreground">—</p>
                            </div>
                            <div className="flex flex-row gap-2">
                                <Button variant="default" className="flex flex-1 h-10" disabled>
                                    Contact
                                </Button>
                                <Button variant="ghost" className="flex flex-1 h-10" disabled>
                                    View Details
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
                                        {selectedProvider?.rating != null ? selectedProvider.rating.toFixed(1) : '—'}
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
                                            return `(${googleCount + scandioCount} Reviews)`;
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
                            <div className="flex flex-col gap-1">
                                <p className="text-sm text-foreground font-medium">Scandio Summary</p>
                                {(() => {
                                    const reviewSummary = selectedProvider
                                        ? (enrichmentCache[selectedProvider.placeId]?.reviewSummary ?? null)
                                        : null;
                                    if (reviewSummary?.trim()) {
                                        return (
                                            <p
                                                className="text-sm text-muted-foreground"
                                                style={{
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 4 as any,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {reviewSummary}
                                            </p>
                                        );
                                    }
                                    return (
                                        <div className="flex flex-col gap-1">
                                            <Skeleton className="h-4 w-full" />
                                            <Skeleton className="h-4 w-3/4" />
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Enrichment fields — shimmer until cache is fetched */}
                            {(() => {
                                const enrich = selectedProvider
                                    ? enrichmentCache[selectedProvider.placeId]
                                    : undefined;
                                const showEnrichShimmer =
                                    isEnrichmentLoading && !enrich && selectedProvider?.website;

                                if (showEnrichShimmer) {
                                    return (
                                        <div className="flex flex-col gap-2">
                                            <Skeleton className="h-4 w-full" />
                                            <Skeleton className="h-4 w-5/6" />
                                            <div className="flex flex-row gap-1 flex-wrap mt-1">
                                                <Skeleton className="h-5 w-20 rounded-full" />
                                                <Skeleton className="h-5 w-16 rounded-full" />
                                                <Skeleton className="h-5 w-24 rounded-full" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (!enrich) return null;

                                return (
                                    <div className="flex flex-col gap-2">
                                        <Badge
                                            variant="secondary"
                                            className="w-fit text-xs rounded-full font-normal"
                                        >
                                            {profileCompletenessLabel(enrich.profileCompleteness ?? 0)}
                                        </Badge>
                                        {enrich.bio?.trim() ? (
                                            <p
                                                className="text-xs text-muted-foreground"
                                                style={{
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 3 as any,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {enrich.bio}
                                            </p>
                                        ) : null}
                                        {enrich.specialisations.length > 0 ? (
                                            <div className="flex flex-row gap-1 flex-wrap">
                                                {enrich.specialisations.slice(0, 4).map((s) => (
                                                    <Badge
                                                        key={s}
                                                        variant="secondary"
                                                        className="text-xs rounded-full font-normal"
                                                    >
                                                        {s}
                                                    </Badge>
                                                ))}
                                            </div>
                                        ) : null}
                                        {enrich.hasWorkPhotos ? (
                                            <Badge
                                                variant="secondary"
                                                className="w-fit text-xs rounded-full font-normal"
                                            >
                                                Work photos available
                                            </Badge>
                                        ) : null}
                                    </div>
                                );
                            })()}

                            {conversationId && (
                                <ReportCard conversationId={conversationId} />
                            )}

                            <div className="flex flex-row gap-2">
                                <Popover open={contactOpen} onOpenChange={setContactOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="default"
                                            className="flex flex-1 h-10"
                                            disabled={!selectedProvider}
                                        >
                                            Contact
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
                                                Start the conversation on WhatsApp, phone, or send them an email.
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
                                        if (!selectedProvider?.providerId) return;
                                        // Pro profile route expects a path param (/pro/[id]) using providers.id.
                                        router.push(`/pro/${encodeURIComponent(selectedProvider.providerId)}`);
                                    }}
                                    disabled={!selectedProvider?.providerId}
                                >
                                    View Details
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

