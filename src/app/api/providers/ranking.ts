import type { ProviderItem } from './contracts';

// Bayesian smoothing parameters.
// C = prior weight (acts as C "phantom" reviews at the prior mean rating).
// Providers with few real reviews are pulled toward the global average,
// preventing 5★ scores from 1–2 reviews from dominating results.
const BAYESIAN_C = 10;
const BAYESIAN_PRIOR = 4.0; // global mean rating assumption

/**
 * Bayesian-averaged star rating, normalised to 0–1.
 * Formula: (n×r + C×m) / (n + C)  where n = review count, r = rating, m = prior.
 */
function bayesianRatingScore(rating: number | null, reviewCount: number): number {
    const r = rating ?? BAYESIAN_PRIOR;
    const n = Math.max(0, reviewCount ?? 0);
    return (n * r + BAYESIAN_C * BAYESIAN_PRIOR) / (n + BAYESIAN_C) / 5.0;
}

/**
 * Proximity score, 0–1. Full score within 2 km, zero at 15 km or beyond.
 * Proximity is a tiebreaker, not the primary sort — hence the 15 km cap.
 */
function proximityScore(distanceKm: number | null): number {
    const d = distanceKm ?? 999;
    if (d <= 0) return 1.0;
    if (d >= 15) return 0.0;
    return 1 - d / 15;
}

/**
 * Relevance score, 0–1, based on how well the provider's name/services
 * match the diagnosed trade detail (subcategory) or broad trade.
 *
 * A waterproofing specialist scores higher than a general handyman when
 * the diagnosis resolves to "waterproofing / rising damp".
 */
function relevanceScore(
    provider: ProviderItem,
    tradeDetail?: string,
    trade?: string
): number {
    if (!tradeDetail && !trade) return 0.5; // neutral when no diagnosis context

    // R5: Include AI-extracted specialisations from enrichment cache in the haystack.
    // A roofing waterproofing specialist was previously scored the same as a general contractor
    // because Google types don't reflect their speciality. Enrichment fixes this.
    const haystack = [
        (provider.name ?? '').toLowerCase(),
        ...(provider.services ?? []).flatMap((s) => [
            (s.short ?? '').toLowerCase(),
            (s.full ?? '').toLowerCase(),
        ]),
        ...(provider.specialisations ?? []).map((s) => s.toLowerCase()),
    ].join(' ');

    // Subcategory match (most specific — highest reward)
    if (tradeDetail) {
        const keywords = tradeDetail
            .toLowerCase()
            .split(/[\s,\/\-]+/)
            .filter((w) => w.length > 3);
        if (keywords.length > 0) {
            const matched = keywords.filter((kw) => haystack.includes(kw)).length;
            if (matched === keywords.length) return 1.0; // full subcategory match
            if (matched > 0) return 0.7 + (matched / keywords.length) * 0.2;
        }
    }

    // Broad trade match
    if (trade) {
        const tradeKws = trade
            .toLowerCase()
            .split(/[\s,\/\-]+/)
            .filter((w) => w.length > 3);
        if (tradeKws.some((kw) => haystack.includes(kw))) return 0.55;
    }

    // No keyword match — provider is present in results but not specialised
    return 0.3;
}

/**
 * Recency score, 0–1. Rewards providers who have been active (matched)
 * recently, signalling they are still responsive. Dormant providers
 * (not seen in 6+ months) score low but are not excluded.
 */
function recencyScore(lastMatchedAt?: string | null): number {
    if (!lastMatchedAt) return 0.5; // unknown → neutral
    const ageDays = (Date.now() - new Date(lastMatchedAt).getTime()) / 86_400_000;
    if (ageDays <= 30) return 1.0;
    if (ageDays <= 90) return 0.7;
    if (ageDays <= 180) return 0.4;
    return 0.1; // dormant > 6 months
}

/**
 * Composite score: Relevance 40%, Bayesian rating 30%, Proximity 20%, Recency 10%,
 * plus a small completeness bonus (max +0.02) for providers with richer profiles. (R9)
 *
 * Weights are intentional:
 *  - Relevance is the strongest signal — a specialist beats a generalist.
 *  - Bayesian rating rewards genuine track records over inflated scores.
 *  - Proximity is a tiebreaker, not the primary driver (15 km cap).
 *  - Recency nudges dormant providers down without fully excluding them.
 *  - Completeness bonus: enriched providers with work photos/certs edge ahead
 *    at equal competitive scores, incentivising complete profiles. Bounded at
 *    +0.02 so it never overrides the primary signals.
 */
export function compositeScore(
    p: ProviderItem,
    tradeDetail?: string,
    trade?: string
): number {
    // R9: Fractional completeness bonus replaces the blunt integer tiebreaker.
    const completenessBonus = ((p.profileCompleteness ?? 0) / 3) * 0.02;
    return (
        0.4 * relevanceScore(p, tradeDetail, trade) +
        0.3 * bayesianRatingScore(p.rating, p.ratingCount ?? 0) +
        0.2 * proximityScore(p.distanceKm) +
        0.1 * recencyScore((p as any).lastMatchedAt) +
        completenessBonus
    );
}

/**
 * Rank providers by composite score and return the top `limit`.
 *
 * @param limit  Maximum providers to return. Default 6 — enough for the carousel.
 * @param options  tradeDetail (subcategory from AI diagnosis) and broad trade string.
 */
export function rankProviders(
    providers: ProviderItem[],
    limit = 6,
    options?: { tradeDetail?: string; trade?: string }
): ProviderItem[] {
    const { tradeDetail, trade } = options ?? {};
    return [...providers]
        .sort((a, b) => {
            const scoreDelta = compositeScore(b, tradeDetail, trade) - compositeScore(a, tradeDetail, trade);
            if (Math.abs(scoreDelta) > 0.01) return scoreDelta;
            const completenessDelta =
                (b.profileCompleteness ?? 0) - (a.profileCompleteness ?? 0);
            if (completenessDelta !== 0) return completenessDelta;
            return 0;
        })
        .slice(0, limit);
}

/**
 * Returns the ISO week key for a given date, e.g. "2026-W12".
 * Used as the bucket key for the provider rotation token table.
 */
export function getISOWeekKey(d: Date = new Date()): string {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum =
        1 +
        Math.round(
            ((date.getTime() - week1.getTime()) / 86_400_000 -
                3 +
                ((week1.getDay() + 6) % 7)) /
                7
        );
    return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
