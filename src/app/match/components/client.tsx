'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toWhatsAppPhone } from '@/lib/utils';
import { setLastConversationIdForWhatsApp } from '@/lib/whatsapp-prefill';
import { INK } from '@/lib/design-tokens';
import { CircleNotch, Crosshair, FunnelSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { MatchMapSheetLayout } from '@/app/match/components/match-map-sheet-layout';
import { ProviderCard } from '@/app/match/components/provider-card';
import dynamic from 'next/dynamic';

// FilterSheet contains shadcn Sheet + heavy filter logic — load it on first open, not on page load.
const FilterSheet = dynamic(
    () => import('@/app/match/components/filter-sheet').then((m) => ({ default: m.FilterSheet })),
    { ssr: false },
);
import {
    applyFilters as applyMatchFilters,
    compareForSort,
    DEFAULT_FILTER_STATE,
    useMatchFilters,
    type MatchFilterState,
} from '@/features/match/hooks/use-match-filters';
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
import { toGooglePlaceId } from '@/lib/providers/persistence';
import { useMatchConversationContext } from '@/features/match/hooks/use-match-conversation-context';
import { useMatchProviders } from '@/features/match/hooks/use-match-providers';
import { useMatchMap } from '@/features/match/hooks/use-match-map';
import { loadMatchPageCache, saveMatchPageCache } from '@/features/match/cache/match-page-cache';
import { MatchNoProvidersEmpty } from '@/app/match/components/empty';
import { fetchConversationDiagnosis } from '@/lib/diagnosis/diagnoses-api';
import { buildDiagnosisVersion } from '@/features/diagnosis/processing-orchestrator';
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
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

    /**
     * URL-synced filter state. We push updates back to the URL via `router.replace` so back/forward
     * works as users tweak filters; we keep the existing `conversationId` query param when present.
     */
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
    // Deduplicate provider_contact analytics per provider per session.
    const providerContactFiredForProviderIdRef = useRef<string | null>(null);
    const providerCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [mapExpandRequestId, setMapExpandRequestId] = useState(0);
    const [searchRadiusMeters, setSearchRadiusMeters] = useState(DEFAULT_SEARCH_RADIUS_METERS);
    const [cachedDiagnosisVersion, setCachedDiagnosisVersion] = useState<string | undefined>(undefined);
    const lastProviderFetchKeyRef = useRef('');

    /**
     * Sort the full provider list by the selected sort key first; the active filter set then
     * narrows the visible list. Keep the sort/filter passes separated so the histogram can
     * count against the *unfiltered* superset while the cards/markers reflect the filtered view.
     */
    const sortedProviders = useMemo(() => {
        return [...providers].sort((a, b) =>
            compareForSort(filterState.sort, a, b, providerPriorityScore)
        );
    }, [providers, filterState.sort]);
    const filteredProviders = useMemo(
        () => applyMatchFilters(sortedProviders, filterState),
        [sortedProviders, filterState]
    );
    const sheetProviders = filteredProviders;

    /** Specialisation chips for the filter sheet — deduped + alphabetical, drawn from loaded providers. */
    const availableSpecialisations = useMemo(() => {
        const set = new Set<string>();
        sortedProviders.forEach((p) => {
            (p.specialisations ?? []).forEach((s) => {
                const t = String(s || '').trim();
                if (t) set.add(t);
            });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [sortedProviders]);
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
        let cancelled = false;
        hydratedFromCacheRef.current = false;
        skipInitialProviderFetchRef.current = false;
        void (async () => {
            const cached = loadMatchPageCache(conversationId);
            if (!cached) {
                trackEvent('prefetch_cache_miss', {
                    diagnosis_id: conversationId,
                    reason: 'no_cache',
                });
                return;
            }
            if (cached.diagnosisVersion) {
                const current = await fetchConversationDiagnosis(conversationId);
                const diagnosis = current.ok ? ((current.data?.diagnosis as any) ?? null) : null;
                const currentVersion =
                    diagnosis && typeof diagnosis === 'object' ? buildDiagnosisVersion(diagnosis) : '';
                if (currentVersion && currentVersion !== cached.diagnosisVersion) {
                    trackEvent('prefetch_discarded', {
                        diagnosis_id: conversationId,
                        reason: 'diagnosis_version_mismatch',
                    });
                    return;
                }
            }
            if (cancelled) return;
            trackEvent('prefetch_cache_hit', {
                diagnosis_id: conversationId,
            });
            hydratedFromCacheRef.current = true;
            skipInitialProviderFetchRef.current = cached.providers.length > 0;
            setCachedDiagnosisVersion(cached.diagnosisVersion);
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
        })();
        return () => {
            cancelled = true;
        };
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
            diagnosisVersion: cachedDiagnosisVersion,
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
        cachedDiagnosisVersion,
        enrichmentCache,
        providers,
        scandioReviewCountByProviderId,
        searchRadiusMeters,
        userLocation,
    ]);

    /**
     * Card-level AI summaries (fast enrich + GET cache):
     * - List from **viewport cache** (same area/trade in sessionStorage): show each provider’s Google
     *   `summary` only; **no** match-page queue/poll — full review-summary work stays on `/contractors/[id]`.
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
            const idx = sheetProviders.findIndex((p) => normalizePlaceKey(p.placeId) === target);
            if (idx >= 0) {
                setCompanyIndex(idx + 1);
                setMapExpandRequestId((n) => n + 1);
                trackEvent('match_marker_tap', {
                    diagnosis_id: conversationId || undefined,
                    provider_id: sheetProviders[idx]?.providerId || undefined,
                    place_id: placeId,
                });
            }
        },
        [conversationId, normalizePlaceKey, setCompanyIndex, sheetProviders]
    );

    const { mapHostRef } = useMatchMap({
        userLocation,
        providers: filteredProviders,
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
                        ? {
                              lat: Number(coordMatch?.[1]),
                              lng: Number(coordMatch?.[2]),
                              westernCapeOnly: true,
                          }
                        : { address: trimmed, westernCapeOnly: true }
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
                            'Please use an address in the Western Cape, South Africa.'
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
            const geo = await geocodeApi({
                lat: coords.lat,
                lng: coords.lng,
                westernCapeOnly: true,
            });
            if (
                !geo ||
                typeof geo.address !== 'string' ||
                !geo.address.trim()
            ) {
                toast.error(
                    geo?.error ||
                        'Your current location appears to be outside the Western Cape.'
                );
                return;
            }
            const loc = { lat: coords.lat, lng: coords.lng, address: geo.address.trim() };
            setUserLocation(loc);
            setAddressInput(loc.address);
            await persistConversationLocation(loc);
        } finally {
            setIsLocatingUser(false);
            setIsLoading(false);
        }
    }, [
        getCurrentCoordinates,
        persistConversationLocation,
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
        router.push(`/contractors/${encodeURIComponent(targetProvider.providerId)}${cid}`);
    }, [conversationId, enrichmentCache, resolveTradeContext, router]);

    return (
        <>
        <MatchMapSheetLayout
            onClose={() => {
                if (!conversationId) {
                    router.back();
                    return;
                }
                router.push(`/diagnosis/${encodeURIComponent(conversationId)}`);
            }}
            expandRequestId={mapExpandRequestId}
            peekProviderCount={filteredProviders.length}
            onSheetModeChange={(next, prev) => {
                trackEvent('match_sheet_snap', {
                    diagnosis_id: conversationId || undefined,
                    from: prev,
                    to: next,
                });
            }}
            scrollToKey={selectedProvider?.placeId ?? null}
            getScrollTarget={() =>
                selectedProvider
                    ? providerCardRefs.current[selectedProvider.placeId] ?? null
                    : null
            }
            headerRight={
                <div className="flex w-full min-w-0 items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Input
                            id="match-address-input"
                            placeholder="Search address"
                            className="h-10 w-full pr-10 text-sm"
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
                            className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            disabled={isUpdatingLocation || isLoading || isLocatingUser}
                            onClick={() => {
                                void handleUseCurrentLocation();
                            }}
                        >
                            {isLocatingUser ? (
                                <CircleNotch size={16} className="animate-spin" />
                            ) : (
                                <Crosshair size={16} />
                            )}
                        </button>
                    </div>
                    <button
                        type="button"
                        aria-label={
                            activeFilterCount > 0
                                ? `Sort and filter (${activeFilterCount} active)`
                                : 'Sort and filter'
                        }
                        className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                        onClick={() => {
                            setIsFilterSheetOpen(true);
                            trackEvent('match_filter_open', {
                                diagnosis_id: conversationId || undefined,
                                active_filter_count: activeFilterCount,
                            });
                        }}
                    >
                        <FunnelSimple size={18} weight="bold" />
                        {activeFilterCount > 0 ? (
                            <span
                                className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 py-0.5 text-[10px] font-semibold leading-none text-background"
                                aria-hidden="true"
                            >
                                {activeFilterCount}
                            </span>
                        ) : null}
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
                        <h3 className="text-lg font-semibold leading-snug" style={{ color: INK }}>Top Recommendations</h3>
                        <div className="flex flex-col gap-4">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div
                                    key={`sk-${i}`}
                                    className="flex flex-col gap-4 rounded-3xl border border-black/[0.07] bg-white p-6 shadow-sm"
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
                            const summaryText = displaySummary
                                ? formatCustomerSummary(displaySummary, provider.name)
                                : null;

                            return (
                                <Fragment key={provider.placeId}>
                                    {idx === 0 ? (
                                        <h3
                                            className="text-lg font-semibold leading-snug"
                                            style={{ color: INK }}
                                        >
                                            Top Recommendations
                                        </h3>
                                    ) : null}
                                    <ProviderCard
                                        provider={provider}
                                        isSelected={companyIndex - 1 === idx}
                                        reviewCount={reviewCount}
                                        summary={summaryText}
                                        summaryLoading={showSummarySkeleton}
                                        longWaitSummaryFallback={
                                            isEnrichmentLoading && summarySkeletonLongWait
                                        }
                                        certifications={provider.certifications}
                                        onSelect={() => setCompanyIndex(idx + 1)}
                                        onOpenProfile={() => {
                                            void openProviderDetails(provider);
                                        }}
                                        onImageSwipe={(toIndex) => {
                                            trackEvent('match_card_image_swipe', {
                                                diagnosis_id: conversationId || undefined,
                                                provider_id: provider.providerId || undefined,
                                                place_id: provider.placeId,
                                                to_index: toIndex,
                                            });
                                        }}
                                        cardRef={(el) => {
                                            providerCardRefs.current[provider.placeId] = el;
                                        }}
                                        contactSlot={
                                            <Popover
                                                open={contactOpen && companyIndex - 1 === idx}
                                                onOpenChange={(open) => {
                                                    if (open) setCompanyIndex(idx + 1);
                                                    setContactOpen(open);
                                                    if (open) trackProviderContactOnceOnOpen();
                                                }}
                                            >
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="h-9 w-full"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        Contact
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    className="w-64 rounded-md border-input p-3 shadow-xl"
                                                    align="start"
                                                    side="top"
                                                    sideOffset={4}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="flex flex-col gap-3">
                                                        <Button
                                                            variant="secondary"
                                                            className="w-full"
                                                            onClick={() => {
                                                                const phone = toWhatsAppPhone(
                                                                    provider.phone
                                                                );
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
                                                            Start on WhatsApp, call them, or send an
                                                            email.
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
                                        }
                                    />
                                </Fragment>
                            );
                        })}
                    </div>
                )}

                {!showBottomSkeleton && !noProviders && filteredProviders.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-background/60 p-4 text-center">
                        <p className="text-sm font-medium">No matches with these filters</p>
                        <p className="text-xs text-muted-foreground">
                            Try clearing some filters or expanding the distance range.
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                                resetFilters();
                                trackEvent('match_filter_clear', {
                                    diagnosis_id: conversationId || undefined,
                                });
                            }}
                        >
                            Clear filters
                        </Button>
                    </div>
                ) : null}
        </MatchMapSheetLayout>

        <FilterSheet
            open={isFilterSheetOpen}
            onOpenChange={(next) => {
                setIsFilterSheetOpen(next);
                if (!next) {
                    trackEvent('match_filter_close', {
                        diagnosis_id: conversationId || undefined,
                        active_filter_count: activeFilterCount,
                    });
                }
            }}
            state={filterState}
            onApply={(next: MatchFilterState) => {
                setFilterState(next);
                setIsFilterSheetOpen(false);
                // If user widened distance past current search radius, expand to 50 km so the
                // server can fetch the broader set on the next location refresh.
                const requiredKm = Math.max(next.distanceMaxKm, DEFAULT_FILTER_STATE.distanceMaxKm);
                if (
                    requiredKm * 1000 > searchRadiusMeters &&
                    requiredKm * 1000 <= EXTENDED_SEARCH_RADIUS_METERS
                ) {
                    setSearchRadiusMeters(EXTENDED_SEARCH_RADIUS_METERS);
                }
                trackEvent('match_filter_apply', {
                    diagnosis_id: conversationId || undefined,
                    active_filter_count: 0, // recomputed by hook after URL change
                    sort: next.sort,
                });
            }}
            providers={sortedProviders}
            availableSpecialisations={availableSpecialisations}
            maxDistanceKm={50}
        />
        </>
    );
}

