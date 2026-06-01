import type { ProviderItem } from '@/lib/providers/contracts';

// Bayesian smoothing parameters.
// C = prior weight (acts as C "phantom" reviews at the prior mean rating).
// Providers with few real reviews are pulled toward the global average,
// preventing 5★ scores from 1–2 reviews from dominating results.
const BAYESIAN_C = 10;
const BAYESIAN_PRIOR = 4.0; // global mean rating assumption

/**
 * Hard floor on Google star rating. Providers rated below this are never shown,
 * even in sparse areas — a sub-3.5 average across real reviews is a poor track
 * record that the Bayesian smoothing alone should not rescue. Unrated providers
 * (rating == null) are exempt: they are new, not bad.
 */
export const PROVIDER_RATING_FLOOR = 3.5;

// Mendr-rating blending constants.
// Mendr outcomes are treated as ~2× more credible per review than a Google
// review, so each Mendr review contributes 2 "phantom" Google-equivalent
// reviews to the Bayesian pool. We require at least 3 Mendr reviews before
// blending — below that the signal is too noisy to trust.
const MENDR_CREDIBILITY_MULTIPLIER = 2;
const MENDR_MIN_COUNT = 3;

/**
 * Haversine great-circle distance between two lat/lng points, in km.
 */
export function haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if the customer location falls within the provider's declared
 * service area. Back-compat: returns true when no service area is declared
 * (null centre or null radius), treating the provider as available everywhere.
 */
export function isProviderInServiceArea(
    provider: import('./contracts').ProviderItem,
    customerLat: number,
    customerLng: number,
): boolean {
    const { service_area_center_lat, service_area_center_lng, service_area_radius_km } = provider;
    // If the provider has not declared a service area, they serve all customers.
    if (
        service_area_center_lat == null ||
        service_area_center_lng == null ||
        service_area_radius_km == null
    ) {
        return true;
    }
    const distKm = haversineKm(
        service_area_center_lat,
        service_area_center_lng,
        customerLat,
        customerLng,
    );
    return distKm <= service_area_radius_km;
}

/**
 * Bayesian-averaged star rating that blends Google reviews with Mendr-side
 * job outcomes. Mendr reviews are weighted at MENDR_CREDIBILITY_MULTIPLIER×
 * because they are verified job completions rather than self-selected reviews.
 *
 * When mendrRatingCount < MENDR_MIN_COUNT the Mendr signal is ignored.
 *
 * Formula (no Mendr):  (n×r + C×m) / (n + C)
 * Formula (with Mendr): blended_rating = (n×r + k×n_m×r_m) / (n + k×n_m)
 *                       then: (blended_n×blended_r + C×m) / (blended_n + C)
 */
function bayesianRatingScore(
    rating: number | null,
    reviewCount: number,
    mendrRating?: number | null,
    mendrRatingCount?: number | null,
): number {
    const r = rating ?? BAYESIAN_PRIOR;
    const n = Math.max(0, reviewCount ?? 0);

    let blendedR = r;
    let blendedN = n;

    const mr = mendrRating ?? null;
    const mn = mendrRatingCount ?? 0;

    if (mr !== null && mn >= MENDR_MIN_COUNT) {
        // Inflate the Mendr count to reflect its higher credibility.
        const mendrEquivN = mn * MENDR_CREDIBILITY_MULTIPLIER;
        blendedN = n + mendrEquivN;
        blendedR = (n * r + mendrEquivN * mr) / blendedN;
    }

    return (blendedN * blendedR + BAYESIAN_C * BAYESIAN_PRIOR) / (blendedN + BAYESIAN_C) / 5.0;
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

    // Ranking haystack: name + AI-extracted specialisations.
    // Google Place types ("Service", "General Contractor") were removed —
    // they contain no trade-specific signal. Enrichment specialisations
    // are the authoritative source of service-level relevance.
    const haystack = [
        (provider.name ?? '').toLowerCase(),
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
 * plus a completeness adjustment that rewards richer profiles and demotes bare
 * ones. (R9, revised)
 *
 * Weights are intentional:
 *  - Relevance is the strongest signal — a specialist beats a generalist.
 *  - Bayesian rating rewards genuine track records over inflated scores.
 *  - Proximity is a tiebreaker, not the primary driver (15 km cap).
 *  - Recency nudges dormant providers down without fully excluding them.
 *  - Completeness adjustment: enriched providers (1–3) get a small edge
 *    (max +0.02), while bare providers (completeness 0 — no website content
 *    and no enrichment) take a real demotion (−0.05) so they don't surface as
 *    empty cards above providers with usable detail. Both are bounded so they
 *    never override the primary relevance/rating signals.
 */
const BARE_PROFILE_PENALTY = -0.05;

export function compositeScore(
    p: ProviderItem,
    tradeDetail?: string,
    trade?: string
): number {
    const completeness = p.profileCompleteness ?? 0;
    // Bare profiles (no usable content) are demoted; enriched profiles keep the
    // small fractional bonus that breaks ties between comparable providers.
    const completenessAdjustment =
        completeness === 0 ? BARE_PROFILE_PENALTY : (completeness / 3) * 0.02;
    return (
        0.4 * relevanceScore(p, tradeDetail, trade) +
        0.3 * bayesianRatingScore(p.rating, p.ratingCount ?? 0, p.mendrRating, p.mendrRatingCount) +
        0.2 * proximityScore(p.distanceKm) +
        0.1 * recencyScore((p as any).lastMatchedAt) +
        completenessAdjustment
    );
}

/**
 * Rank providers by composite score and return the top `limit`.
 *
 * @param limit  Maximum providers to return. Default 6 — enough for the carousel.
 * @param options  tradeDetail (subcategory from AI diagnosis), broad trade string,
 *                 and optional customer coordinates for service-area filtering.
 *                 When customerLat and customerLng are both present, providers
 *                 whose declared service area does not include the customer location
 *                 are excluded before ranking. Providers with no declared service
 *                 area are always kept (back-compat).
 */
export function rankProviders(
    providers: ProviderItem[],
    limit = 6,
    options?: { tradeDetail?: string; trade?: string; customerLat?: number; customerLng?: number }
): ProviderItem[] {
    const { tradeDetail, trade, customerLat, customerLng } = options ?? {};

    // Hard quality floor: never surface providers rated below the floor. Not
    // relaxed in sparse areas. Unrated providers (rating == null) are kept.
    const aboveFloor = providers.filter(
        (p) => !(typeof p.rating === 'number' && p.rating < PROVIDER_RATING_FLOOR),
    );

    // Apply service-area filter only when both customer coordinates are available.
    const filtered =
        customerLat != null && customerLng != null
            ? aboveFloor.filter((p) => isProviderInServiceArea(p, customerLat, customerLng))
            : aboveFloor;

    return [...filtered]
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
