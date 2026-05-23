/**
 * Fast-path mapping of Google Places results to provider items for the
 * /api/providers route. Extracted from `handler.ts` in Phase 2.
 *
 * The MVP fast path skips deep enrichment and heavy caching — it filters
 * places by relevance + radius + minimum review count and projects them onto
 * the `FastProvider` shape ready for ranking.
 *
 * Pure given fixed inputs — no I/O, no Supabase, no Gemini.
 */

import { greatCircleDistanceKm } from './handler-distance';
import { isProviderRelevantForTrade } from './relevance';
import { normalizeProviderName } from './provider-display-name';
import { getPlaceServices } from './place-services';
import { formatWeekdayDescriptionsTo24h } from './format-weekday-descriptions';
import { isOpenNowFromWeekdayDescriptions } from './open-status';

export interface FastProvider {
    placeId: string;
    place_id?: string;
    name: string;
    address: string;
    rating: number | null;
    ratingCount: number;
    latitude: number | null;
    longitude: number | null;
    distanceKm: number | null;
    durationText: string;
    website: string | null;
    phone: string | null;
    summary: string;
    summaryMeta?: { kind: 'reviews'; pos: number; neg: number; neu: number } | null;
    services?: { full: string }[];
    isOpen: boolean | null;
    weekdayDescriptions?: string[];
}

export interface MapPlacesParams {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    places: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routingSummaries: any[];
    lat: number;
    lng: number;
    radius: number;
    tradeNorm: string;
    isBoreholeLikeDetail: boolean;
    minRatingCount: number;
    relevanceMode: 'strict' | 'relaxed';
}

/**
 * Project Places results into `FastProvider[]`, applying relevance, geo-radius,
 * and minimum-review-count filters. Order is preserved from `places` so the
 * caller can rely on it for diagnostics / rotation. Routing summaries are
 * indexed in lock-step with `places`.
 */
export function mapPlacesToFastProviders(params: MapPlacesParams): FastProvider[] {
    const {
        places,
        routingSummaries,
        lat,
        lng,
        radius,
        tradeNorm,
        isBoreholeLikeDetail,
        minRatingCount,
        relevanceMode,
    } = params;
    const radiusKm = radius / 1000;

    return places
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((place: any, index: number): FastProvider | null => {
            if (
                !isProviderRelevantForTrade({
                    place,
                    aiData: null,
                    cached: null,
                    tradeNorm,
                    isBoreholeLikeDetail,
                    mode: relevanceMode,
                })
            ) {
                return null;
            }

            const placeLat = place.location?.latitude;
            const placeLng = place.location?.longitude;
            if (typeof placeLat !== 'number' || typeof placeLng !== 'number') {
                return null;
            }
            const straightLineKm = greatCircleDistanceKm(
                Number(lat),
                Number(lng),
                placeLat,
                placeLng,
            );
            if (straightLineKm > radiusKm + 0.5) return null;

            let distanceKm: number | null = null;
            let durationText = '';
            const leg = routingSummaries[index]?.legs?.[0];
            const meters = leg?.distanceMeters;
            if (typeof meters === 'number') {
                distanceKm = Number((meters / 1000).toFixed(1));
                if (meters > radius) return null;
            } else {
                distanceKm = Number(straightLineKm.toFixed(1));
            }
            const durationRaw: string | undefined = leg?.duration;
            if (durationRaw) {
                const secs = parseInt(durationRaw.replace('s', ''), 10);
                if (!Number.isNaN(secs)) {
                    const mins = Math.round(secs / 60);
                    durationText =
                        mins < 60
                            ? `${mins} min`
                            : `${Math.floor(mins / 60)} h ${mins % 60} min`;
                }
            }

            const normalizedName = normalizeProviderName(
                place.displayName?.text || 'Unknown Provider',
            );
            const ratingCount = place.userRatingCount ?? 0;

            if (ratingCount < minRatingCount) return null;

            const services = getPlaceServices(place.types);
            const weekdayDescriptionsRaw = (
                place.regularOpeningHours as { weekdayDescriptions?: string[] } | undefined
            )?.weekdayDescriptions;
            const weekdayDescriptionsFormatted =
                formatWeekdayDescriptionsTo24h(weekdayDescriptionsRaw) ?? [];
            const isOpen = isOpenNowFromWeekdayDescriptions(
                weekdayDescriptionsFormatted,
                new Date(),
            );
            const finalSummary =
                (place?.editorialSummary?.text as string | undefined) ||
                (place?.editorialSummary as string | undefined) ||
                (place?.reviewSummary as string | undefined) ||
                (place?.reviewSummary?.text as string | undefined) ||
                '';

            return {
                placeId: place.id,
                place_id: place.id?.replace?.(/^places\//, '') ?? place.id,
                name: normalizedName || 'Unknown Provider',
                address: place.formattedAddress || 'Address not available',
                rating: place.rating ?? null,
                ratingCount: place.userRatingCount ?? 0,
                latitude: place.location?.latitude ?? null,
                longitude: place.location?.longitude ?? null,
                distanceKm,
                durationText,
                website: place.websiteUri ?? null,
                phone: place.nationalPhoneNumber ?? null,
                summary: finalSummary,
                summaryMeta: null,
                services,
                isOpen,
                weekdayDescriptions: weekdayDescriptionsFormatted,
            };
        })
        .filter((p): p is FastProvider => p !== null);
}

export interface SelectFastProvidersParams {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    places: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routingSummaries: any[];
    lat: number;
    lng: number;
    radius: number;
    tradeNorm: string;
    isBoreholeLikeDetail: boolean;
    providerLimit: number;
}

export interface SelectFastProvidersResult {
    providers: FastProvider[];
    minRatingUsed: number;
    relevanceModeUsed: 'strict' | 'relaxed';
}

/**
 * Run the cascading-fallback selection used by the route:
 *   1. Strict relevance, base minimum review count (3 or 5 depending on radius).
 *   2. If too few results AND base > 3, retry with minReviews=3.
 *   3. Still too few → minReviews=1 (sparse-area fallback).
 *   4. Still too few → relaxed semantic relevance (banned categories + geo
 *      still enforced, but specialisation matching softened).
 */
export function selectFastProviders(
    params: SelectFastProvidersParams,
): SelectFastProvidersResult {
    const {
        places,
        routingSummaries,
        lat,
        lng,
        radius,
        tradeNorm,
        isBoreholeLikeDetail,
        providerLimit,
    } = params;

    const baseMinRating = radius >= 20_000 ? 3 : 5;
    let minRatingUsed = baseMinRating;
    let relevanceModeUsed: 'strict' | 'relaxed' = 'strict';

    const map = (minRatingCount: number, mode: 'strict' | 'relaxed') =>
        mapPlacesToFastProviders({
            places,
            routingSummaries,
            lat,
            lng,
            radius,
            tradeNorm,
            isBoreholeLikeDetail,
            minRatingCount,
            relevanceMode: mode,
        });

    let providers = map(baseMinRating, 'strict');
    if (baseMinRating > 3 && providers.length < providerLimit) {
        minRatingUsed = 3;
        providers = map(3, 'strict');
    }
    if (providers.length < providerLimit) {
        minRatingUsed = 1;
        providers = map(1, 'strict');
    }
    if (providers.length < providerLimit) {
        relevanceModeUsed = 'relaxed';
        providers = map(minRatingUsed, 'relaxed');
    }
    return { providers, minRatingUsed, relevanceModeUsed };
}
