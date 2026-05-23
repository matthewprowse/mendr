/**
 * Distance and radius helpers extracted from `handler.ts` in Phase 2.
 *
 * Pure functions — no I/O, no state. Used by the providers route to enforce
 * search radius and decide how many providers to return per request.
 */

/**
 * Straight-line distance in km. Enforces the search radius when Places routing
 * legs are missing (locationBias can still return far-away matches).
 */
export function greatCircleDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Maximum number of providers returned per request, scaled by search radius.
 * Wider searches surface more results because the per-trade density drops off.
 */
export function getProviderResultLimitByRadius(radiusMeters: number): number {
    if (radiusMeters >= 50_000) return 100;
    if (radiusMeters >= 20_000) return 40;
    if (radiusMeters >= 10_000) return 20;
    return 10;
}

/**
 * Target number of places to fetch from Google Text Search before ranking.
 * Provides ranking headroom (extra candidates we may drop) while capping API
 * cost. Always at least 20, at most 120, scales linearly with provider limit.
 */
export function getTargetPlacesCountByRadius(radiusMeters: number): number {
    const providerLimit = getProviderResultLimitByRadius(radiusMeters);
    return Math.min(120, Math.max(20, providerLimit + 20));
}
