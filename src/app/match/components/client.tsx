'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatBusinessName, toWhatsAppPhone } from '@/lib/utils';
import { setLastConversationIdForWhatsApp } from '@/lib/whatsapp-prefill';
import { Car, MapTrifold, Star } from '@phosphor-icons/react';
import { Loader2, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import { MatchMapSheetLayout } from '@/app/match/components/match-map-sheet-layout';
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
import { toGooglePlaceId } from '@/app/api/providers/persistence';
import { useMatchConversationContext } from '@/features/match/hooks/use-match-conversation-context';
import { useMatchProviders } from '@/features/match/hooks/use-match-providers';
import { useMatchMap } from '@/features/match/hooks/use-match-map';
import { loadMatchPageCache, saveMatchPageCache } from '@/features/match/cache/match-page-cache';
import { MatchNoProvidersEmpty } from '@/app/match/components/empty';
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

function formatDuration(text: string): string {
    return text.replace(/\bmins?\b/gi, 'Minutes').replace(/\bhrs?\b/gi, 'Hours');
}

function totalReviewCountForProvider(
    p: MatchProvider,
    scandioReviewCountByProviderId: Record<string, number>
): number {
    const pid = p.providerId;
    const fromProvider = typeof p.scandioReviewCount === 'number' ? p.scandioReviewCount : 0;
    const fromMap =
        pid && typeof scandioReviewCountByProviderId[pid] === 'number'
            ? scandioReviewCountByProviderId[pid]
            : 0;
    return (p.ratingCount ?? 0) + (fromProvider || fromMap);
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

/**
 * Match card loading: resolved when we have summary text, or when fast path definitively skipped
 * (`fast_insufficient`). Do **not** treat `enrichedAt` alone as resolved — timeout markers used
 * `scrape_status=ok` with null summary and would otherwise block re-queue/poll after a fix.
 */
function matchCardEnrichmentResolved(
    cache: Record<string, EnrichmentCacheEntry>,
    provider: MatchProvider | null
): boolean {
    if (!provider) return false;
    const entry = enrichmentEntryForProvider(cache, provider);
    const summary = (entry?.reviewSummary ?? '').trim();
    if (summary.length > 0) return true;
    if (entry?.fastSummaryInsufficient) return true;
    return false;
}

function matchCardEnrichmentResolvedByPlaceId(
    cache: Record<string, EnrichmentCacheEntry>,
    placeId: string
): boolean {
    if (!placeId) return false;
    const entry =
        cache[placeId] ||
        cache[placeId.replace(/^places\//, '')] ||
        cache[`places/${placeId.replace(/^places\//, '')}`];
    const summary = (entry?.reviewSummary ?? '').trim();
    if (summary.length > 0) return true;
    if (entry?.fastSummaryInsufficient) return true;
    return false;
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
        maxDelayMs?: number;
        signal?: AbortSignal;
        onRoundComplete?: (round: number) => void;
        onStop?: (reason: 'enriched' | 'aborted' | 'max_rounds' | 'error', rounds: number) => void;
    }
): Promise<void> {
    const {
        maxRounds = 5,
        initialDelayMs = 400,
        maxDelayMs = 2500,
        signal,
        onRoundComplete,
        onStop,
    } = options ?? {};
    let delay = initialDelayMs;
    let roundsCompleted = 0;

    for (let round = 0; round < maxRounds; round += 1) {
        if (signal?.aborted) {
            onStop?.('aborted', roundsCompleted);
            return;
        }
        const pending = placeIds.filter((id) => !matchCardEnrichmentResolvedByPlaceId(cacheRef.current, id));
        if (pending.length === 0) {
            onStop?.('enriched', roundsCompleted);
            return;
        }

        if (round > 0) {
            await sleep(delay);
            if (signal?.aborted) {
                onStop?.('aborted', roundsCompleted);
                return;
            }
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

        delay = Math.min(Math.round(delay * 1.5), maxDelayMs);
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

const DEFAULT_SEARCH_RADIUS_METERS = 25_000;
const EXTENDED_SEARCH_RADIUS_METERS = 50_000;
/** Max providers to enqueue per /api/enrich/queue call (fast review-summary mode; keeps work bounded per request). */
const MAX_ENRICH_QUEUE_PER_WAVE = 12;

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
        isRefreshingProvidersInBackground,
        refreshProvidersForLocation,
        providersFromViewportCache,
    } = useMatchProviders({
        resolveTradeContext,
        conversationId,
    });
    const [contactOpen, setContactOpen] = useState(false);
    const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
    const [isLocatingUser, setIsLocatingUser] = useState(false);
    // Deduplicate provider_contact analytics per provider per session.
    const providerContactFiredForProviderIdRef = useRef<string | null>(null);
    const providerCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [mapExpandRequestId, setMapExpandRequestId] = useState(0);
    const [searchRadiusMeters, setSearchRadiusMeters] = useState(DEFAULT_SEARCH_RADIUS_METERS);
    const lastProviderFetchKeyRef = useRef('');

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
    const sheetProviders = sortedProviders;
    const totalCompanies = Math.max(sheetProviders.length, 1);
    const selectedProvider = useMemo(() => {
        const idx = Math.min(Math.max(companyIndex - 1, 0), Math.max(sheetProviders.length - 1, 0));
        return sheetProviders[idx] || null;
    }, [sheetProviders, companyIndex]);

    /** Keep current place id for enrich queue priority without re-running the effect when selection changes. */
    const selectedPlaceIdForEnrichRef = useRef<string | null>(null);
    selectedPlaceIdForEnrichRef.current = selectedProvider?.placeId
        ? String(selectedProvider.placeId).trim()
        : null;

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
    /** After ~18s of global enrichment polling, stop per-card skeletons (still loading in background). */
    const [summarySkeletonLongWait, setSummarySkeletonLongWait] = useState(false);
    useEffect(() => {
        if (!isEnrichmentLoading) {
            setSummarySkeletonLongWait(false);
            return;
        }
        const id = window.setTimeout(() => setSummarySkeletonLongWait(true), 18_000);
        return () => window.clearTimeout(id);
    }, [isEnrichmentLoading]);
    /** Dedupe identical `/api/enrich/queue` batches when React re-runs the effect. */
    const lastEnrichQueueSignatureRef = useRef<string>('');
    /** Bumps when we need to re-run queue + poll after an empty cache (e.g. providers row race). */
    const [enrichmentKick, setEnrichmentKick] = useState(0);
    const enrichmentQueueRetryCountRef = useRef(0);

    useEffect(() => {
        lastProviderFetchKeyRef.current = '';
        lastEnrichQueueSignatureRef.current = '';
        enrichmentQueueRetryCountRef.current = 0;
        setEnrichmentKick(0);
    }, [conversationId]);

    const hydratedFromCacheRef = useRef(false);
    /** When sessionStorage cache had providers, skip the initial `/api/providers` fetch (avoids duplicate load). */
    const skipInitialProviderFetchRef = useRef(false);
    const enrichmentCacheRef = useRef(enrichmentCache);
    enrichmentCacheRef.current = enrichmentCache;

    /** Re-run enrichment when any summary lands so the next wave can be queued (not just when the provider list changes). */
    const enrichmentPendingKey = useMemo(() => {
        return sortedProviders
            .filter((p) => !matchCardEnrichmentResolved(enrichmentCache, p))
            .map((p) => String(p.placeId || '').trim())
            .filter(Boolean)
            .sort()
            .join(',');
    }, [sortedProviders, enrichmentCache]);

    useEffect(() => {
        enrichmentQueueRetryCountRef.current = 0;
    }, [enrichmentPendingKey]);

    useEffect(() => {
        if (!conversationId) return;
        hydratedFromCacheRef.current = false;
        skipInitialProviderFetchRef.current = false;
        const cached = loadMatchPageCache(conversationId);
        if (!cached) return;

        hydratedFromCacheRef.current = true;
        skipInitialProviderFetchRef.current = cached.providers.length > 0;
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
        if (
            typeof cached.searchRadiusMeters === 'number' &&
            Number.isFinite(cached.searchRadiusMeters) &&
            cached.searchRadiusMeters > 0
        ) {
            setSearchRadiusMeters(cached.searchRadiusMeters);
        }
        setIsLoading(false);
    }, [conversationId, setAddressInput, setCompanyIndex, setProviders, setUserLocation]);

    useEffect(() => {
        if (!userLocation) return;
        if (skipInitialProviderFetchRef.current) {
            skipInitialProviderFetchRef.current = false;
            lastProviderFetchKeyRef.current = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)},${searchRadiusMeters}`;
            return;
        }
        const fetchKey = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)},${searchRadiusMeters}`;
        if (fetchKey === lastProviderFetchKeyRef.current) return;
        lastProviderFetchKeyRef.current = fetchKey;
        void refreshProvidersForLocation(userLocation, searchRadiusMeters);
    }, [userLocation, searchRadiusMeters, refreshProvidersForLocation]);

    useEffect(() => {
        if (!conversationId) return;
        saveMatchPageCache(conversationId, {
            providers,
            companyIndex,
            searchRadiusMeters,
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
        searchRadiusMeters,
        userLocation,
    ]);

    /**
     * Card-level AI summaries (fast enrich + GET cache):
     * - List from **viewport cache** (same area/trade in sessionStorage): show each provider’s Google
     *   `summary` only; **no** match-page queue/poll — full review-summary work stays on `/pro/[id]`.
     * - List from **fresh `/api/providers`**: queue fast summaries and poll GET until resolved.
     * - **Match session cache** (`loadMatchPageCache`): restores `enrichmentCache` with the list; this
     *   effect runs only for rows still missing cache entries.
     */
    useEffect(() => {
        if (providers.length === 0) {
            setIsEnrichmentLoading(false);
            return;
        }
        if (providersFromViewportCache) {
            setIsEnrichmentLoading(false);
            return;
        }
        if (!enrichmentPendingKey) {
            setIsEnrichmentLoading(false);
            return;
        }

        const providersNeedingSummary = sortedProviders.filter(
            (p) => !matchCardEnrichmentResolved(enrichmentCache, p)
        );
        const pendingPlaceIds = providersNeedingSummary
            .map((p) => String(p.placeId || '').trim())
            .filter(Boolean);
        if (pendingPlaceIds.length === 0) {
            setIsEnrichmentLoading(false);
            return;
        }

        const queueSet = new Set(pendingPlaceIds.slice(0, MAX_ENRICH_QUEUE_PER_WAVE));
        const selId = selectedPlaceIdForEnrichRef.current ?? '';
        if (selId && pendingPlaceIds.includes(selId)) {
            queueSet.add(selId);
        }
        const queuePlaceIds = Array.from(queueSet);
        const queueProviderIdsAligned = queuePlaceIds.map((pl) => {
            const row = providersNeedingSummary.find((x) => String(x.placeId || '').trim() === pl);
            return row?.providerId?.trim() ?? '';
        });

        const placeToProviderId: Record<string, string> = {};
        for (const p of providersNeedingSummary) {
            const pl = String(p.placeId || '').trim();
            const pid = p.providerId?.trim();
            if (!pl || !pid) continue;
            placeToProviderId[pl] = pid;
            const raw = pl.replace(/^places\//, '');
            if (raw !== pl) placeToProviderId[raw] = pid;
            placeToProviderId[toGooglePlaceId(pl)] = pid;
        }
        const providerIdsAlignedForPlaces = (ids: string[]) =>
            ids.map(
                (id) =>
                    placeToProviderId[id] ??
                    placeToProviderId[id.replace(/^places\//, '')] ??
                    placeToProviderId[toGooglePlaceId(id)] ??
                    ''
            );

        const queueSig =
            queuePlaceIds.slice().sort().join(',') +
            '|' +
            queueProviderIdsAligned.filter(Boolean).slice().sort().join(',');

        const shouldQueue = Boolean(queueSig && queueSig !== lastEnrichQueueSignatureRef.current);
        if (shouldQueue) {
            lastEnrichQueueSignatureRef.current = queueSig;
        }

        let cancelled = false;
        const abortController = new AbortController();
        setIsEnrichmentLoading(true);
        void (async () => {
            const mergeCache = (cache: Record<string, EnrichmentCacheEntry> | null) => {
                if (cancelled || !cache) return;
                // Update ref synchronously so `pollEnrichment` sees merged data immediately (React state
                // commits async; without this, round 0 re-fetches and polls for seconds even when cached).
                const next = { ...enrichmentCacheRef.current, ...cache };
                enrichmentCacheRef.current = next;
                setEnrichmentCache(next);
            };

            // Do not await queue: /api/enrich/queue runs all Gemini jobs before responding (long-pending
            // request) and would block the first GET + poll. Fire-and-forget; polling picks up cache.
            if (shouldQueue) {
                void resolveTradeContext()
                    .then(({ trade }) =>
                        queueEnrichmentApi(queuePlaceIds, trade || undefined, {
                            priorityPlaceId: selId || undefined,
                            providerIds: queueProviderIdsAligned.some(Boolean)
                                ? queueProviderIdsAligned
                                : undefined,
                        })
                    )
                    .catch(() => {});
            }
            if (cancelled) return;

            const initial = await fetchEnrichmentApi(pendingPlaceIds, {
                providerIdsAligned: providerIdsAlignedForPlaces(pendingPlaceIds),
            });
            mergeCache(initial);
            const allResolvedAfterInitial = pendingPlaceIds.every((id) =>
                matchCardEnrichmentResolvedByPlaceId(enrichmentCacheRef.current, id)
            );
            if (allResolvedAfterInitial) {
                return;
            }
            await pollEnrichment(
                pendingPlaceIds,
                (ids) =>
                    fetchEnrichmentApi(ids, {
                        providerIdsAligned: providerIdsAlignedForPlaces(ids),
                    }),
                enrichmentCacheRef,
                (cache) => {
                    enrichmentCacheRef.current = cache;
                    setEnrichmentCache(cache);
                },
                {
                    maxRounds: 14,
                    initialDelayMs: 280,
                    maxDelayMs: 2400,
                    signal: abortController.signal,
                }
            );

            if (!cancelled) {
                const ref = enrichmentCacheRef.current;
                const stillUnresolved = pendingPlaceIds.some(
                    (id) => !matchCardEnrichmentResolvedByPlaceId(ref, id)
                );
                if (stillUnresolved && enrichmentQueueRetryCountRef.current < 3) {
                    enrichmentQueueRetryCountRef.current += 1;
                    lastEnrichQueueSignatureRef.current = '';
                    setEnrichmentKick((k) => k + 1);
                }
            }
        })().finally(() => {
            if (!cancelled) setIsEnrichmentLoading(false);
        });

        return () => {
            cancelled = true;
            abortController.abort();
            // Always clear: if `cancelled` is true, `finally` above skips setState and loading stuck true (infinite skeleton).
            setIsEnrichmentLoading(false);
        };
    }, [
        enrichmentPendingKey,
        providers.length,
        providersFromViewportCache,
        resolveTradeContext,
        enrichmentKick,
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

    const normalizePlaceKey = useCallback((id: string) => id.replace(/^places\//, '').trim(), []);

    const handleMapMarkerClick = useCallback(
        (placeId: string) => {
            const target = normalizePlaceKey(placeId);
            const idx = sortedProviders.findIndex((p) => normalizePlaceKey(p.placeId) === target);
            if (idx >= 0) {
                setCompanyIndex(idx + 1);
                setMapExpandRequestId((n) => n + 1);
            }
        },
        [normalizePlaceKey, sortedProviders, setCompanyIndex]
    );

    const { mapHostRef } = useMatchMap({
        userLocation,
        providers,
        onMarkerClick: handleMapMarkerClick,
        showSearchRadius: true,
        searchRadiusMeters,
        showUserPin: true,
        selectedPlaceId: selectedProvider?.placeId ?? null,
        viewportSearch: false,
    });

    useEffect(() => {
        if (sheetProviders.length === 0) return;
        setCompanyIndex((prev) => Math.min(Math.max(prev, 1), sheetProviders.length));
    }, [sheetProviders.length, setCompanyIndex]);

    const updateLocationFromAddress = useCallback(
        async (address: string) => {
            if (!conversationId) return;
            const trimmed = address.trim();
            if (!trimmed) return;

            setIsUpdatingLocation(true);
            setIsLoading(true);
            setProviders([]);
            setCompanyIndex(1);
            setSearchRadiusMeters(DEFAULT_SEARCH_RADIUS_METERS);
            lastProviderFetchKeyRef.current = '';

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
            } finally {
                setIsUpdatingLocation(false);
                setIsLoading(false);
            }
        },
        [conversationId, persistConversationLocation, setUserLocation]
    );

    const handleUseCurrentLocation = useCallback(async () => {
        setIsLocatingUser(true);
        setIsLoading(true);
        setSearchRadiusMeters(DEFAULT_SEARCH_RADIUS_METERS);
        lastProviderFetchKeyRef.current = '';
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
        } finally {
            setIsLocatingUser(false);
            setIsLoading(false);
        }
    }, [
        getCurrentCoordinates,
        persistConversationLocation,
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
                await ensureLocation();
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [conversationId, ensureLocation]);

    useEffect(() => {
        if (!userLocation) return;
        setAddressInput(userLocation.address || `${userLocation.lat}, ${userLocation.lng}`);
    }, [userLocation]);

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
        if (!matchCardEnrichmentResolved(enrichmentCache, targetProvider)) {
            const { trade } = await resolveTradeContext();
            void queueEnrichmentApi([targetProvider.placeId], trade || undefined, {
                priorityPlaceId: targetProvider.placeId,
                providerIds: [targetProvider.providerId],
            }).catch(() => {});
        }
        const cid = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
        router.push(`/pro/${encodeURIComponent(targetProvider.providerId)}${cid}`);
    }, [conversationId, enrichmentCache, resolveTradeContext, router]);

    return (
        <MatchMapSheetLayout
            onClose={() => router.back()}
            expandRequestId={mapExpandRequestId}
            scrollToKey={selectedProvider?.placeId ?? null}
            getScrollTarget={() =>
                selectedProvider
                    ? providerCardRefs.current[selectedProvider.placeId] ?? null
                    : null
            }
            headerRight={
                <div className="flex w-full min-w-0 items-center gap-2">
                    <Input
                        id="match-address-input"
                        placeholder="Search address"
                        className="h-10 min-w-0 flex-1 text-sm"
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
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
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
            }
            mapSlot={<div ref={mapHostRef} className="absolute inset-0 h-full w-full" />}
            mapLoadingOverlay={
                showBottomSkeleton || !userLocation ? (
                    <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-background/70">
                        <p className="px-4 text-center text-xs text-muted-foreground">
                            {isLoading || isProvidersLoading
                                ? 'Finding service providers…'
                                : 'Add your address or use current location'}
                        </p>
                    </div>
                ) : null
            }
        >
                <div className="flex flex-col gap-1 text-center">
                    <p className="text-sm font-semibold text-foreground">
                        {!showBottomSkeleton && sheetProviders.length > 0
                            ? `${sheetProviders.length} Service Provider${sheetProviders.length === 1 ? '' : 's'}`
                            : 'Providers'}
                    </p>
                    {!showBottomSkeleton && userLocation ? (
                        <p className="text-xs text-muted-foreground">
                            Within {searchRadiusMeters >= EXTENDED_SEARCH_RADIUS_METERS ? 50 : 25} km of your
                            address
                        </p>
                    ) : null}
                    {!showBottomSkeleton && isRefreshingProvidersInBackground ? (
                        <p className="text-xs text-muted-foreground">Updating results for this view…</p>
                    ) : null}
                </div>

                {showBottomSkeleton ? (
                    <>
                        <h3 className="text-xl font-bold text-foreground">Top Recommendations</h3>
                        <div className="flex flex-col gap-4">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div
                                    key={`sk-${i}`}
                                    className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6"
                                >
                                    <div className="space-y-2">
                                        <Skeleton className="h-6 w-56" />
                                        <Skeleton className="h-4 w-44" />
                                    </div>
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-[92%]" />
                                    <div className="flex gap-4">
                                        <Skeleton className="h-10 flex-1" />
                                        <Skeleton className="h-10 flex-1" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : noProviders ? (
                    <MatchNoProvidersEmpty onEditAddress={focusAddressSearch} />
                ) : (
                    <div className="flex flex-col gap-4">
                        {sheetProviders.map((provider, idx) => {
                            const enrich = enrichmentEntryForProvider(enrichmentCache, provider);
                            const scandioSummary = (enrich?.reviewSummary ?? '').trim();
                            const googleSummary = (provider.summary ?? '').trim();
                            const providerAiSummary = (provider.enrichmentReviewSummary ?? '').trim();
                            const displaySummary =
                                scandioSummary || googleSummary || providerAiSummary;
                            const reviewCount = totalReviewCountForProvider(
                                provider,
                                scandioReviewCountByProviderId
                            );
                            const enrichmentResolved = matchCardEnrichmentResolved(
                                enrichmentCache,
                                provider
                            );
                            const showSummarySkeleton =
                                !displaySummary &&
                                !enrichmentResolved &&
                                isEnrichmentLoading &&
                                !summarySkeletonLongWait;

                            return (
                                <Fragment key={provider.placeId}>
                                    {idx === 0 ? (
                                        <h3 className="text-xl font-bold text-foreground">Top Recommendations</h3>
                                    ) : null}
                                    <div
                                        ref={(el) => {
                                            providerCardRefs.current[provider.placeId] = el;
                                        }}
                                        className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6"
                                    >
                                        <div className="flex flex-col gap-2">
                                            <h3 className="truncate text-lg font-bold text-foreground">
                                                {formatBusinessName(provider.name)}
                                            </h3>
                                            <div className="flex flex-row flex-wrap items-center gap-2">
                                                <Star
                                                    className="size-5 shrink-0 text-yellow-500"
                                                    weight="fill"
                                                    aria-hidden="true"
                                                />
                                                <p className="text-sm font-bold text-foreground tabular-nums">
                                                    {provider.rating != null ? provider.rating.toFixed(1) : 'N/A'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {reviewCount}{' '}
                                                    {reviewCount === 1 ? 'Review' : 'Reviews'}
                                                </p>
                                                {typeof provider.isOpen === 'boolean' ? (
                                                    <Badge variant="secondary">
                                                        {provider.isOpen ? 'Open' : 'Closed'}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-4">
                                            {displaySummary ? (
                                                <p className="text-sm text-muted-foreground">
                                                    {formatCustomerSummary(displaySummary, provider.name)}
                                                </p>
                                            ) : showSummarySkeleton ? (
                                                <div
                                                    className="flex flex-col gap-2"
                                                    aria-busy="true"
                                                    aria-label="Loading Review Summary"
                                                >
                                                    <Skeleton className="h-3.5 w-full" />
                                                    <Skeleton className="h-3.5 w-[94%]" />
                                                    <Skeleton className="h-3.5 w-[78%]" />
                                                </div>
                                            ) : isEnrichmentLoading && summarySkeletonLongWait ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Review summary is taking longer than usual — open the profile
                                                    for full details.
                                                </p>
                                            ) : !isEnrichmentLoading ? (
                                                <p className="text-sm text-muted-foreground">
                                                    We're still generating this summary...

                                                </p>
                                            ) : null}
                                            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                                                <div className="flex items-start gap-2">
                                                    <MapTrifold
                                                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                                        aria-hidden="true"
                                                    />
                                                    <span className="min-w-0 break-words">
                                                        {formatProviderAddress(provider.address) ||
                                                            'Address not available'}
                                                    </span>
                                                </div>
                                                {provider.durationText ? (
                                                    <div className="flex items-center gap-2">
                                                        <Car
                                                            className="size-3.5 shrink-0 text-muted-foreground"
                                                            aria-hidden="true"
                                                        />
                                                        <span>{formatDuration(provider.durationText)}</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex flex-row justify-end gap-4">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="h-10 flex-1"
                                                onClick={() => {
                                                    void openProviderDetails(provider);
                                                }}
                                                disabled={!provider.providerId}
                                            >
                                                View More
                                            </Button>
                                            <Popover
                                                open={contactOpen && companyIndex - 1 === idx}
                                                onOpenChange={(open) => {
                                                    if (open) setCompanyIndex(idx + 1);
                                                    setContactOpen(open);
                                                    if (open) trackProviderContactOnceOnOpen();
                                                }}
                                            >
                                                <PopoverTrigger asChild>
                                                    <Button type="button" className="h-10 flex-1">
                                                        Contact Contractor
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    className="w-64 rounded-md border-input p-3 shadow-xl"
                                                    align="start"
                                                    side="top"
                                                    sideOffset={4}
                                                >
                                                    <div className="flex flex-col gap-3">
                                                        <Button
                                                            variant="secondary"
                                                            className="w-full"
                                                            onClick={() => {
                                                                const phone = toWhatsAppPhone(provider.phone);
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
                                                            disabled={!toWhatsAppPhone(provider.phone)}
                                                        >
                                                            WhatsApp
                                                        </Button>
                                                        <p className="text-center text-xs text-muted-foreground">
                                                            Start on WhatsApp, call them, or send an email.
                                                        </p>
                                                        <div className="flex flex-row gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                className="h-9 flex-1"
                                                                onClick={() => {
                                                                    if (provider.phone) {
                                                                        trackContactIntent('phone');
                                                                        window.location.href = `tel:${provider.phone}`;
                                                                    }
                                                                    setContactOpen(false);
                                                                }}
                                                                disabled={!provider.phone}
                                                            >
                                                                Phone
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                className="h-9 flex-1"
                                                                onClick={() => {
                                                                    if (provider.website) {
                                                                        trackContactIntent('email');
                                                                        window.location.href = `mailto:${provider.website}`;
                                                                    }
                                                                    setContactOpen(false);
                                                                }}
                                                                disabled={!provider.website}
                                                            >
                                                                Email
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </div>
                                </Fragment>
                            );
                        })}
                    </div>
                )}

                {!showBottomSkeleton && !noProviders && userLocation ? (
                    <div className="flex flex-col gap-2">
                        {searchRadiusMeters < EXTENDED_SEARCH_RADIUS_METERS ? (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="w-fit self-center"
                                disabled={isProvidersLoading}
                                onClick={() => {
                                    setSearchRadiusMeters(EXTENDED_SEARCH_RADIUS_METERS);
                                    trackEvent('match_extend_radius', {
                                        diagnosis_id: conversationId || undefined,
                                        radius_km: 50,
                                    });
                                }}
                            >
                                {isProvidersLoading ? 'Updating…' : 'Extend Search Radius'}
                            </Button>
                        ) : (
                            <p className="text-center text-xs text-muted-foreground">
                                You are searching within 50 km. Change your address above to narrow results.
                            </p>
                        )}
                    </div>
                ) : null}
        </MatchMapSheetLayout>
    );
}

