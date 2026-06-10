/* eslint-disable no-console */

import type { EnrichmentCacheEntry, MatchProvider } from '@/features/match/contracts';

export const DEFAULT_SEARCH_RADIUS_METERS = 25_000;
export const EXTENDED_SEARCH_RADIUS_METERS = 50_000;
/** Max providers to enqueue per /api/enrich/queue call (fast review-summary mode; keeps work bounded per request). */
export const MAX_ENRICH_QUEUE_PER_WAVE = 12;

export function totalReviewCountForProvider(
    p: MatchProvider,
    mendrReviewCountByProviderId: Record<string, number>
): number {
    const pid = p.providerId;
    const fromProvider = typeof p.mendrReviewCount === 'number' ? p.mendrReviewCount : 0;
    const fromMap =
        pid && typeof mendrReviewCountByProviderId[pid] === 'number'
            ? mendrReviewCountByProviderId[pid]
            : 0;
    return (p.ratingCount ?? 0) + (fromProvider || fromMap);
}

export function enrichmentEntryForProvider(
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
export function matchCardEnrichmentResolved(
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

export function matchCardEnrichmentResolvedByPlaceId(
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

export async function pollEnrichment(
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
export function formatCustomerSummary(summary: string, providerName: string): string {
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

export function providerPriorityScore(provider: MatchProvider): number {
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
