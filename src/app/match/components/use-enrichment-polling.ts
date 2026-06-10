'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { EnrichmentCacheEntry, MatchProvider } from '@/features/match/contracts';
import {
    fetchEnrichmentApi,
    queueEnrichmentApi,
    reviewsCountApi,
} from '@/features/match/api/client';
import { toGooglePlaceId } from '@/lib/providers/persistence';
import {
    MAX_ENRICH_QUEUE_PER_WAVE,
    matchCardEnrichmentResolved,
    matchCardEnrichmentResolvedByPlaceId,
    pollEnrichment,
} from '@/app/match/components/enrichment-utils';

/**
 * Enrichment-related state for the match page: per-card Mendr review counts, the
 * enrichment cache (keyed by Google Place ID), loading/skeleton flags, queue dedupe
 * refs and the pending-key memo that drives the queue + poll effect.
 */
export function useEnrichmentState({
    conversationId,
    sortedProviders,
    lastProviderFetchKeyRef,
}: {
    conversationId: string;
    sortedProviders: MatchProvider[];
    lastProviderFetchKeyRef: MutableRefObject<string>;
}) {
    const [mendrReviewCountByProviderId, setMendrReviewCountByProviderId] = useState<
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

    return {
        mendrReviewCountByProviderId,
        setMendrReviewCountByProviderId,
        enrichmentCache,
        setEnrichmentCache,
        isEnrichmentLoading,
        setIsEnrichmentLoading,
        summarySkeletonLongWait,
        lastEnrichQueueSignatureRef,
        enrichmentKick,
        setEnrichmentKick,
        enrichmentQueueRetryCountRef,
        hydratedFromCacheRef,
        skipInitialProviderFetchRef,
        enrichmentCacheRef,
        enrichmentPendingKey,
    };
}

/**
 * Card-level AI summaries (fast enrich + GET cache):
 * - List from **viewport cache** (same area/trade in sessionStorage): show each provider’s Google
 *   `summary` only; **no** match-page queue/poll — full review-summary work stays on `/pro/[id]`.
 * - List from **fresh `/api/providers`**: queue fast summaries and poll GET until resolved.
 * - **Match session cache** (`loadMatchPageCache`): restores `enrichmentCache` with the list; this
 *   effect runs only for rows still missing cache entries.
 */
export function useEnrichmentQueueAndPoll({
    enrichmentPendingKey,
    providersCount,
    providersFromViewportCache,
    resolveTradeContext,
    enrichmentKick,
    sortedProviders,
    enrichmentCache,
    selectedPlaceIdForEnrichRef,
    enrichmentCacheRef,
    lastEnrichQueueSignatureRef,
    enrichmentQueueRetryCountRef,
    setEnrichmentCache,
    setIsEnrichmentLoading,
    setEnrichmentKick,
}: {
    enrichmentPendingKey: string;
    providersCount: number;
    providersFromViewportCache: boolean;
    resolveTradeContext: () => Promise<{ trade: string; trade_detail: string }>;
    enrichmentKick: number;
    sortedProviders: MatchProvider[];
    enrichmentCache: Record<string, EnrichmentCacheEntry>;
    selectedPlaceIdForEnrichRef: MutableRefObject<string | null>;
    enrichmentCacheRef: MutableRefObject<Record<string, EnrichmentCacheEntry>>;
    lastEnrichQueueSignatureRef: MutableRefObject<string>;
    enrichmentQueueRetryCountRef: MutableRefObject<number>;
    setEnrichmentCache: Dispatch<SetStateAction<Record<string, EnrichmentCacheEntry>>>;
    setIsEnrichmentLoading: Dispatch<SetStateAction<boolean>>;
    setEnrichmentKick: Dispatch<SetStateAction<number>>;
}): void {
    useEffect(() => {
        if (providersCount === 0) {
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
        providersCount,
        providersFromViewportCache,
        resolveTradeContext,
        enrichmentKick,
    ]);
}

/** Fetch the Mendr review count for the selected provider when it is not already known. */
export function useMendrReviewCountFetch({
    selectedProvider,
    mendrReviewCountByProviderId,
    setMendrReviewCountByProviderId,
}: {
    selectedProvider: MatchProvider | null;
    mendrReviewCountByProviderId: Record<string, number>;
    setMendrReviewCountByProviderId: Dispatch<SetStateAction<Record<string, number>>>;
}): void {
    useEffect(() => {
        const pid = selectedProvider?.providerId;
        if (!pid) return;
        if (typeof selectedProvider?.mendrReviewCount === 'number') return;
        if (Object.prototype.hasOwnProperty.call(mendrReviewCountByProviderId, pid)) return;

        let cancelled = false;
        void (async () => {
            try {
                const data = await reviewsCountApi(pid);
                if (cancelled) return;
                const count = typeof data?.mendrReviewCount === 'number' ? data.mendrReviewCount : 0;
                setMendrReviewCountByProviderId((prev) => ({ ...prev, [pid]: count }));
            } catch {
                if (cancelled) return;
                setMendrReviewCountByProviderId((prev) => ({ ...prev, [pid]: 0 }));
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selectedProvider?.providerId, mendrReviewCountByProviderId]);
}
