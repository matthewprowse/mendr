'use client';
/* eslint-disable no-console */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toWhatsAppPhone } from '@/lib/utils';
import { setLastConversationIdForWhatsApp, resolveWhatsAppPrefill } from '@/lib/whatsapp-prefill';
import { Loader, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { HomeownerAuthDialog } from '@/components/homeowner-auth-dialog';
import { ContactConsentDialog, CONSENT_TEXT_VERSION } from '@/components/contact-consent-dialog';
import { MatchResultsLayout } from '@/app/match/components/match-map-sheet-layout';
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
import type { EnrichmentCacheEntry } from '@/features/match/contracts';
import { toGooglePlaceId } from '@/lib/providers/persistence';
import { useMatchConversationContext } from '@/features/match/hooks/use-match-conversation-context';
import { useMatchProviders } from '@/features/match/hooks/use-match-providers';
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

    // Prioritise quality and confidence signals for "top recommendrtions".
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
        refreshProvidersForLocation,
        providersFromViewportCache,
    } = useMatchProviders({
        resolveTradeContext,
        conversationId,
    });
    const [contactOpen, setContactOpen] = useState(false);
    // Contact gate (Phase 2): logged-in + captured number + consent before any
    // WhatsApp/Call/Email action. The lead and shared identity are written at
    // the moment of consent, before any message is sent.
    const { user } = useAuth();
    const [authOpen, setAuthOpen] = useState(false);
    const [consentOpen, setConsentOpen] = useState(false);
    const [contactBusy, setContactBusy] = useState(false);
    const [consentMode, setConsentMode] = useState<'ask_each_time' | 'always_share' | null>(null);
    const [pendingContact, setPendingContact] = useState<{
        provider: MatchProvider;
        channel: 'whatsapp' | 'phone' | 'email';
    } | null>(null);
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
    const [searchRadiusMeters, setSearchRadiusMeters] = useState(DEFAULT_SEARCH_RADIUS_METERS);
    const [cachedDiagnosisVersion, setCachedDiagnosisVersion] = useState<string | undefined>(undefined);
    const lastProviderFetchKeyRef = useRef('');

    /**
     * Sort the full provider list by the selected sort key first; the active filter set then
     * narrows the visible list. Keep the sort/filter passes separated so the histogram can
     * count against the *unfiltered* superset while the cards/markers reflect the filtered view.
     */
    const sortedProviders = useMemo(() => {
        // Dedupe first so the same company is never listed twice (provider id, else
        // place id, else normalised name as the identity key).
        const seen = new Set<string>();
        const deduped: MatchProvider[] = [];
        for (const p of providers) {
            const key = (p.providerId || p.placeId || p.name || '').toLowerCase().trim();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            deduped.push(p);
        }
        return deduped.sort((a, b) =>
            compareForSort(filterState.sort, a, b, providerPriorityScore)
        );
    }, [providers, filterState.sort]);
    const filteredProviders = useMemo(
        () => applyMatchFilters(sortedProviders, filterState),
        [sortedProviders, filterState]
    );
    const sheetProviders = filteredProviders;

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
            // Durable "Matches Shown" funnel stamp (server-side, first write wins).
            // Unlike the analytics event above, this persists to diagnosis_funnel.
            if (conversationId) {
                void fetch(
                    `/api/diagnoses/${encodeURIComponent(conversationId)}/matches-shown`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ matchCount: providers.length }),
                        keepalive: true,
                    },
                ).catch(() => {});
            }
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
        // Identity is gated: a locked card cannot open the full profile. Prompt
        // sign-in instead (the profile reveals name and contact).
        if (targetProvider.identityLocked) {
            setAuthOpen(true);
            return;
        }
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

    const addressField = (
        <div className="relative w-full">
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
                    <Loader size={16} className="animate-spin" />
                ) : (
                    <Crosshair size={16} />
                )}
            </button>
        </div>
    );

    const openSortFilter = () => {
        setIsFilterSheetOpen(true);
        trackEvent('match_filter_open', {
            diagnosis_id: conversationId || undefined,
            active_filter_count: activeFilterCount,
        });
    };

    const sortFilterControls = (
        <Button type="button" variant="secondary" className="w-full" onClick={openSortFilter}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
    );

    // --- Contact channel actions (run only after the gate passes) ---------------
    const openWhatsAppChannel = async (provider: MatchProvider) => {
        const waPhone = toWhatsAppPhone(provider.phone);
        if (!waPhone) return;
        const profileUrl = provider.providerId
            ? `${window.location.origin}/pro/${provider.providerId}`
            : window.location.href;
        const prefill = await resolveWhatsAppPrefill(profileUrl);
        let text = [
            `Hi${provider.name ? ` ${provider.name}` : ''}, I found you on Mendr.`,
            prefill.diagnosis && prefill.diagnosis !== 'Home repair or maintenance'
                ? `Mendr diagnosed my issue: ${prefill.diagnosis}.`
                : `I have a home repair issue I'd like your help with.`,
            prefill.report_url
                ? `You can view my full Mendr report here: ${prefill.report_url}`
                : '',
            `Are you available to assist?`,
        ]
            .filter(Boolean)
            .join('\n\n');
        try {
            const res = await fetch('/api/whatsapp-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diagnosis: prefill.diagnosis,
                    provider_name: provider.name,
                    trade: prefill.trade,
                    report_url: prefill.report_url,
                    profile_url: prefill.profile_url,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as { message?: string };
            if (res.ok && data.message?.trim()) text = data.message.trim();
        } catch {
            // Keep the template fallback.
        }
        window.open(
            `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`,
            '_blank',
            'noopener,noreferrer'
        );
    };

    const openPhoneChannel = (provider: MatchProvider) => {
        if (provider.phone) window.location.href = `tel:${provider.phone}`;
    };

    const openEmailChannel = (provider: MatchProvider) => {
        if (provider.website) window.location.href = `mailto:${provider.website}`;
    };

    // Records the identified lead + consent, then opens the channel. Best-effort
    // recording — a failure must never block the homeowner contacting.
    const executeContact = async (
        provider: MatchProvider,
        channel: 'whatsapp' | 'phone' | 'email'
    ) => {
        trackContactIntent(channel);
        if (provider.providerId && conversationId) {
            try {
                await fetch('/api/contact/contractor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        providerId: provider.providerId,
                        diagnosisId: conversationId,
                        channel,
                        consentTextVersion: CONSENT_TEXT_VERSION,
                    }),
                });
            } catch {
                // Non-fatal — proceed to the channel regardless.
            }
        }
        if (channel === 'whatsapp') await openWhatsAppChannel(provider);
        else if (channel === 'phone') openPhoneChannel(provider);
        else openEmailChannel(provider);
    };

    // The gate: sign in -> captured number -> consent, then contact.
    const beginContact = async (
        provider: MatchProvider,
        channel: 'whatsapp' | 'phone' | 'email'
    ) => {
        if (!user) {
            setPendingContact({ provider, channel });
            setAuthOpen(true);
            return;
        }
        // A captured number is required so the lead is identified.
        try {
            const res = await fetch('/api/account/phone');
            const data = (await res.json().catch(() => ({}))) as { phone?: string | null };
            if (!data.phone) {
                toast.info('Add your mobile number so specialists can reach you.');
                router.push('/onboarding');
                return;
            }
        } catch {
            // If the check itself fails, do not hard-block the contact.
        }
        let mode = consentMode;
        if (mode == null) {
            try {
                const res = await fetch('/api/account/consent-settings');
                const data = (await res.json().catch(() => ({}))) as {
                    mode?: 'ask_each_time' | 'always_share';
                };
                mode = data.mode ?? 'ask_each_time';
                setConsentMode(mode);
            } catch {
                mode = 'ask_each_time';
            }
        }
        if (mode === 'always_share') {
            void executeContact(provider, channel);
            return;
        }
        setPendingContact({ provider, channel });
        setConsentOpen(true);
    };

    const handleConsentConfirm = async (dontAskAgain: boolean) => {
        if (!pendingContact) return;
        setContactBusy(true);
        try {
            if (dontAskAgain) {
                setConsentMode('always_share');
                void fetch('/api/account/consent-settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'always_share' }),
                }).catch(() => {});
            }
            await executeContact(pendingContact.provider, pendingContact.channel);
        } finally {
            setContactBusy(false);
            setConsentOpen(false);
            setPendingContact(null);
        }
    };

    const renderContactSlot = (provider: MatchProvider, idx: number) => (
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
                    variant="secondary"
                    className="h-10 w-full"
                    onClick={(e) => e.stopPropagation()}
                >
                    Contact
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-64 rounded-md border-input/75 p-3"
                align="start"
                side="top"
                sideOffset={4}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Button
                            type="button"
                            className="w-full"
                            onClick={() => {
                                setContactOpen(false);
                                void beginContact(provider, 'whatsapp');
                            }}
                            disabled={!toWhatsAppPhone(provider.phone)}
                        >
                            WhatsApp
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            We share your name and number with this specialist so they can help.
                            You confirm before anything is sent.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => {
                                setContactOpen(false);
                                void beginContact(provider, 'phone');
                            }}
                            disabled={!provider.phone}
                        >
                            Phone
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => {
                                setContactOpen(false);
                                void beginContact(provider, 'email');
                            }}
                            disabled={!provider.website}
                        >
                            Email
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );

    const renderProviderCard = (provider: MatchProvider, idx: number) => {
        const enrich = enrichmentEntryForProvider(enrichmentCache, provider);
        const scandioSummary = (enrich?.reviewSummary ?? '').trim();
        const googleSummary = (provider.summary ?? '').trim();
        const providerAiSummary = (provider.enrichmentReviewSummary ?? '').trim();
        const displaySummary = scandioSummary || googleSummary || providerAiSummary;
        const reviewCount = totalReviewCountForProvider(provider, scandioReviewCountByProviderId);
        const enrichmentResolved = matchCardEnrichmentResolved(enrichmentCache, provider);
        const showSummarySkeleton =
            !displaySummary && !enrichmentResolved && isEnrichmentLoading && !summarySkeletonLongWait;
        const summaryText = displaySummary
            ? formatCustomerSummary(displaySummary, provider.name)
            : null;
        return (
            <ProviderCard
                key={provider.placeId}
                provider={provider}
                reviewCount={reviewCount}
                summary={summaryText}
                summaryLoading={showSummarySkeleton}
                onSelect={() => setCompanyIndex(idx + 1)}
                onViewMore={() => {
                    void openProviderDetails(provider);
                }}
                contactSlot={renderContactSlot(provider, idx)}
            />
        );
    };

    /** Drop companies that resolved enrichment with no review summary; keep pending ones (skeleton). */
    const providerHasSummary = (p: MatchProvider) => {
        const enrich = enrichmentEntryForProvider(enrichmentCache, p);
        const summary =
            (enrich?.reviewSummary ?? '').trim() ||
            (p.summary ?? '').trim() ||
            (p.enrichmentReviewSummary ?? '').trim();
        if (summary.length > 0) return true;
        return isEnrichmentLoading && !matchCardEnrichmentResolved(enrichmentCache, p);
    };
    const visibleProviders = sheetProviders.filter(providerHasSummary);

    const listContent = showBottomSkeleton ? (
        <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={`sk-${i}`}
                    className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
                >
                    <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                            <Skeleton className="h-6 w-3/5" />
                            <Skeleton className="size-8 rounded-md" />
                        </div>
                        <Skeleton className="h-4 w-2/5" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-[92%]" />
                        <Skeleton className="h-3.5 w-[70%]" />
                    </div>
                    <div className="flex gap-2">
                        <Skeleton className="h-10 flex-1" />
                        <Skeleton className="h-10 flex-1" />
                    </div>
                </div>
            ))}
        </div>
    ) : noProviders ? (
        <MatchNoProvidersEmpty onEditAddress={focusAddressSearch} />
    ) : visibleProviders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background p-4 text-center">
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
    ) : (
        <div className="flex flex-col gap-4">
            {visibleProviders.map((provider, idx) => renderProviderCard(provider, idx))}
        </div>
    );

    return (
        <>
        <MatchResultsLayout
            onClose={() => {
                if (!conversationId) {
                    router.back();
                    return;
                }
                router.push(`/diagnosis/${encodeURIComponent(conversationId)}`);
            }}
            addressSlot={addressField}
            controlsSlot={sortFilterControls}
        >
                {listContent}
        </MatchResultsLayout>

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
            maxDistanceKm={50}
        />

        <HomeownerAuthDialog
            open={authOpen}
            onOpenChange={setAuthOpen}
            reason="Sign in to contact this specialist — it's free."
        />
        <ContactConsentDialog
            open={consentOpen}
            onOpenChange={(o) => {
                setConsentOpen(o);
                if (!o) setPendingContact(null);
            }}
            businessName={pendingContact?.provider.name || 'this specialist'}
            onConfirm={(dontAsk) => void handleConsentConfirm(dontAsk)}
            busy={contactBusy}
        />
        </>
    );
}

