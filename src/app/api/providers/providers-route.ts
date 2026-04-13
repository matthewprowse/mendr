import { NextRequest, NextResponse } from 'next/server';
import { logAiEvent } from '@/lib/ai-logging';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { sanitizeCustomerSummary } from '@/lib/review-summary';
import { formatWeekdayDescriptionsTo24h } from '@/lib/format-weekday-descriptions';
import { isOpenNowFromWeekdayDescriptions } from '@/lib/open-status';
import { buildProviderQuery } from './query-builder';
import { rankProviders, getISOWeekKey, compositeScore } from './ranking';
import type { ProviderItem, ProvidersRequestBody, ProvidersResponseBody } from './contracts';
import { buildSearchCacheKey } from './cache';
import { withTimeout } from './review-enrichment';
import { toGooglePlaceId } from './persistence';
import { isProviderRelevantForTrade } from './relevance';
import { normalizePlaceId } from './place-id';
import { normalizeProviderName } from './provider-display-name';
import { getPlaceServices } from './place-services';
import {
    fetchPlaceReviewsFromGoogle,
    mapGoogleReviewsToInput,
} from './google-place-reviews';
import {
    SEARCH_CACHE_TTL_MS,
    TWENTY_FOUR_MONTHS_MS,
    TEXT_SEARCH_MAX_EXTRA_PAGES,
    RETAIL_TYPES,
    REVIEW_SYNC_TTL_MS,
} from './providers-route-constants';

/** Straight-line distance in km. Enforces the search radius when Places routing legs are missing (locationBias can still return far-away matches). */
function greatCircleDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getProviderResultLimitByRadius(radiusMeters: number): number {
    if (radiusMeters >= 50_000) return 50;
    if (radiusMeters >= 20_000) return 20;
    if (radiusMeters >= 10_000) return 10;
    return 5;
}

export async function POST(req: NextRequest) {
    // ── Rate limit ─────────────────────────────────────────────────────────────
    const limited = checkRateLimit(req, 'providers');
    if (limited) return limited;

    try {
        const startedAt = Date.now();
        let searchCacheHit = false;
        let searchCacheExpired = false;
        let textSearchExtraPagesFetched = 0;
        const body = (await req.json()) as ProvidersRequestBody;
        const {
            lat,
            lng,
            trade,
            radius: customRadius,  // capped below
            pageToken,
            searchQuery: providedSearchQuery,
            /** Optional specialty line from AI diagnosis (same as `conversations.diagnosis.trade_detail`). Refines Google text search. */
            tradeDetail,
        } = body;
        let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
        let adminSupabase: Awaited<ReturnType<typeof createSupabaseAdminClient>> | null = null;
        try {
            supabase = await createSupabaseServerClient();
        } catch (e) {
            console.warn(
                'Supabase not configured — provider cache disabled:',
                (e as Error).message
            );
        }
        try {
            adminSupabase = await createSupabaseAdminClient();
        } catch {
            // Non-fatal; we can still serve providers without DB caching.
        }

        if (!lat || !lng || !trade) {
            return NextResponse.json(
                { error: 'Missing required parameters (lat, lng, trade)' },
                { status: 400 }
            );
        }
        if (pageToken && !providedSearchQuery) {
            return NextResponse.json(
                { error: 'searchQuery is required when using pageToken for pagination' },
                { status: 400 }
            );
        }

        // Prefer a server-only env var, but fall back to the NEXT_PUBLIC key so
        // local/dev setups that only define NEXT_PUBLIC_* don't hard-fail.
        const apiKey =
            process.env.GOOGLE_PLACES_API_KEY ||
            process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
            process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const apiKeySource = process.env.GOOGLE_PLACES_API_KEY
            ? 'GOOGLE_PLACES_API_KEY'
            : process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
              ? 'NEXT_PUBLIC_GOOGLE_PLACES_API_KEY'
              : process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'
                : 'none';

        if (!apiKey) {
            // eslint-disable-next-line no-console
            console.error(
                'Google Places API key is missing. Set `GOOGLE_PLACES_API_KEY` (preferred) or `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`.'
            );
            return NextResponse.json(
                {
                    error:
                        'Google Places API key is not configured (expected `GOOGLE_PLACES_API_KEY` or `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`)',
                },
                { status: 500 }
            );
        }

        // eslint-disable-next-line no-console
        console.log(
            `Using Google Places API key from ${apiKeySource} (starts: ${apiKey.substring(0, 6)}..., length: ${apiKey.length})`
        );

        // Cap at 50 km (50,000 m) — callers cannot request unbounded searches.
        const radius = Math.min(Number(customRadius) || 50_000, 50_000);

        // 1. Trade → Places search query (used for API call and response; set once so cache path has it)
        const {
            tradeNorm,
            tradeDetailRaw,
            detailKeyForCache,
            canonicalServiceLabel,
            isBoreholeLikeDetail,
            searchQuery,
        } = buildProviderQuery({
            trade,
            providedSearchQuery,
            tradeDetail,
        });

        // Search cache: (lat, lng, trade, radius) -> place_ids + routing (+ optional full providers JSON for fast hits).
        let places: any[] = [];
        let routingSummaries: any[] = [];
        let data: { nextPageToken?: string | null; places?: any[]; routingSummaries?: any[] } = {
            nextPageToken: null,
        };
        let cachedData: any[] = [];
        let pendingCacheWrite: { key: string; placeIds: string[]; routing: any[]; nextToken: string | null } | null = null;

        if (!pageToken && (adminSupabase || supabase)) {
            const latR = Math.round(Number(lat) * 1000) / 1000;
            const lngR = Math.round(Number(lng) * 1000) / 1000;
            const searchCacheKey = buildSearchCacheKey({
                lat: Number(lat),
                lng: Number(lng),
                tradeNorm,
                detailKeyForCache,
                radius: Number(radius),
            });
            const cacheReader = adminSupabase || supabase!;
            const { data: searchRow } = await cacheReader
                .from('provider_search_cache')
                .select('place_ids, routing_summaries, next_page_token, created_at, providers')
                .eq('query_key', searchCacheKey)
                .single();
            if (searchRow?.place_ids && Array.isArray(searchRow.place_ids) && searchRow.place_ids.length > 0) {
                const createdAt = searchRow.created_at ? new Date(searchRow.created_at).getTime() : 0;
                const ageMs = Date.now() - createdAt;
                if (ageMs < SEARCH_CACHE_TTL_MS) {
                    searchCacheHit = true;
                    // Fast path: use stored providers JSON so we skip the providers table lookup (one fewer DB round-trip).
                    const cachedProviders = searchRow.providers as any[] | null;
                    // Summaries now come from enrichmentCache (loaded separately by the UI),
                    // so the search cache is valid as long as it has providers with basic data.
                    const cacheHasRichFields =
                        !!(
                            cachedProviders &&
                            Array.isArray(cachedProviders) &&
                            cachedProviders.length > 0 &&
                            cachedProviders.some(
                                (p) =>
                                    typeof (p as any)?.name === 'string' &&
                                    (p as any).name.trim().length > 0
                            )
                        );

                    if (cacheHasRichFields) {
                        // Normalize display names (strip Pty Ltd, etc.) even when serving cache.
                        // If we had to change anything, update cache/provider rows in the background.
                        let mutated = false;
                        const normalizedCached = (cachedProviders || []).map((p: any) => {
                            if (!p || typeof p !== 'object') return p;
                            const current = typeof p.name === 'string' ? p.name : '';
                            const normalized = normalizeProviderName(current);
                            if (normalized && normalized !== current) {
                                mutated = true;
                                return { ...p, name: normalized };
                            }
                            return p;
                        });
                        const originLat = Number(lat);
                        const originLng = Number(lng);
                        const radiusKm = radius / 1000;
                        // Enforce minimum review count on cached providers as well.
                        // Also drop rows outside the requested radius (cache may predate stricter geo checks).
                        const filteredCached = normalizedCached.filter((p: any) => {
                            const count = p?.ratingCount ?? p?.rating_count ?? 0;
                            if (!(typeof count === 'number' && count >= 5)) return false;
                            const plat = p?.latitude;
                            const plng = p?.longitude;
                            if (typeof plat !== 'number' || typeof plng !== 'number') return false;
                            return (
                                greatCircleDistanceKm(originLat, originLng, plat, plng) <=
                                radiusKm + 0.5
                            );
                        });
                        // If we can serve providers from cache but have no persisted Google reviews yet,
                        // force a Google refresh path so the downstream review import runs.
                        let shouldForceGoogleFetchForReviews = false;
                        if (supabase && filteredCached.length > 0) {
                            try {
                                const cachedGoogleIds = filteredCached
                                    .map((p: any) => {
                                        const pid = p?.placeId || p?.place_id;
                                        if (!pid || typeof pid !== 'string') return null;
                                        return pid.startsWith('places/') ? pid : `places/${pid}`;
                                    })
                                    .filter(Boolean) as string[];
                                const { data: cachedProviderRows } = await supabase
                                    .from('providers')
                                    .select('id, google_place_id')
                                    .in('google_place_id', cachedGoogleIds);
                                const providerIds = (cachedProviderRows || []).map((r: any) => String(r.id));
                                if (providerIds.length === 0) {
                                    shouldForceGoogleFetchForReviews = true;
                                } else {
                                    const { data: anyReviewRows } = await supabase
                                        .from('reviews')
                                        .select('id')
                                        .eq('source', 'google')
                                        .in('provider_id', providerIds)
                                        .limit(1);
                                    if (!anyReviewRows || anyReviewRows.length === 0) {
                                        shouldForceGoogleFetchForReviews = true;
                                    }
                                }
                            } catch {
                                // If this check fails, do not block the request.
                            }
                        }
                        if (shouldForceGoogleFetchForReviews) {
                            searchCacheExpired = true;
                        }
                        if (mutated) {
                            createSupabaseAdminClient()
                                .then((adminSupabase) =>
                                    adminSupabase
                                        .from('provider_search_cache')
                                        .update({ providers: filteredCached })
                                        .eq('query_key', searchCacheKey)
                                )
                                .catch(() => {});
                        }
                        // Always persist returned providers so they exist when user clicks "View profile".
                        if (!filteredCached.length && !shouldForceGoogleFetchForReviews) {
                            const durationMs = Date.now() - startedAt;
                            logAiEvent({
                                endpoint: 'providers',
                                status: 'ok',
                                durationMs,
                                meta: {
                                    trade,
                                    providersCount: 0,
                                    searchCacheHit: true,
                                    usedCacheProvidersJson: true,
                                },
                            });
                            return NextResponse.json({
                                providers: [],
                                nextPageToken: searchRow.next_page_token || null,
                                searchQuery,
                            });
                        }
                        if (!shouldForceGoogleFetchForReviews) {
                            createSupabaseAdminClient()
                                .then((adminSupabase) =>
                                    adminSupabase.from('providers').upsert(
                                        filteredCached
                                            .map((p: any) => {
                                                const pid = p?.placeId || p?.place_id;
                                                if (!pid) return null;
                                                const googlePlaceId =
                                                    typeof pid === 'string' && pid.startsWith('places/')
                                                        ? pid
                                                        : `places/${pid}`;
                                                const hours = formatWeekdayDescriptionsTo24h(p?.weekdayDescriptions) ?? [];
                                                return {
                                                    source: 'google',
                                                    google_place_id: googlePlaceId,
                                                    name: p?.name || '',
                                                    address: p?.address || null,
                                                    rating: p?.rating ?? null,
                                                    rating_count: p?.ratingCount ?? p?.rating_count ?? 0,
                                                    phone: p?.phone ?? null,
                                                    website: p?.website ?? null,
                                                    latitude: p?.latitude ?? null,
                                                    longitude: p?.longitude ?? null,
                                                    summary: p?.summary ?? '',
                                                    services: p?.services ?? [],
                                                    weekday_descriptions: hours.length > 0 ? hours : null,
                                                    last_updated: new Date().toISOString(),
                                                    updated_at: new Date().toISOString(),
                                                };
                                            })
                                            .filter(Boolean),
                                        { onConflict: 'google_place_id' }
                                    )
                                )
                                .catch(() => {});
                        }

                        if (!shouldForceGoogleFetchForReviews) {
                            const durationMs = Date.now() - startedAt;
                            // Ensure cached providers also include internal `providerId` (providers.id).
                            let providersWithIds: any[] = (normalizedCached || []) as any[];
                            if (supabase) {
                                const googlePlaceIds = (normalizedCached || [])
                                    .map((p: any) => {
                                        const pid = p?.placeId || p?.place_id;
                                        if (!pid || typeof pid !== 'string') return null;
                                        return pid.startsWith('places/') ? pid : `places/${pid}`;
                                    })
                                    .filter(Boolean) as string[];
                                if (googlePlaceIds.length > 0) {
                                    const { data: providerRowsForIds } = await supabase
                                        .from('providers')
                                        .select('id, google_place_id')
                                        .in('google_place_id', googlePlaceIds);
                                    const idByGoogle = new Map(
                                        (providerRowsForIds || []).map((r: any) => [
                                            String(r.google_place_id),
                                            String(r.id),
                                        ])
                                    );
                                    providersWithIds = (normalizedCached || []).map((p: any) => {
                                        const pid = p?.placeId || p?.place_id;
                                        if (!pid || typeof pid !== 'string') return p;
                                        const gId = pid.startsWith('places/') ? pid : `places/${pid}`;
                                        return { ...p, providerId: idByGoogle.get(gId) || p.providerId };
                                    });
                                }
                            }

                            // Always compute open/closed from stored weekday descriptions.
                            const now = new Date();
                            providersWithIds = providersWithIds.map((p: any) => {
                                const hoursRaw = p?.weekdayDescriptions ?? p?.weekday_descriptions ?? null;
                                const hoursFormatted = formatWeekdayDescriptionsTo24h(hoursRaw) ?? hoursRaw;
                                const isOpen = isOpenNowFromWeekdayDescriptions(hoursFormatted, now);
                                return { ...p, isOpen };
                            });

                            // R4: Re-rank using the current timestamp so recency scores are fresh.
                            // The ranking function is pure (<1 ms) — stale cached scores are replaced
                            // without any I/O cost.
                            const reRankedCached = rankProviders(
                                providersWithIds as ProviderItem[],
                                getProviderResultLimitByRadius(radius),
                                { tradeDetail: tradeDetailRaw, trade: tradeNorm }
                            );

                            logAiEvent({
                                endpoint: 'providers',
                                status: 'ok',
                                durationMs,
                                meta: {
                                    trade,
                                    providersCount: reRankedCached.length,
                                    searchCacheHit: true,
                                    usedCacheProvidersJson: true,
                                },
                            });
                            return NextResponse.json({
                                providers: reRankedCached,
                                nextPageToken: searchRow.next_page_token || null,
                                searchQuery,
                            });
                        }
                    }
                    // Backward-compat: if cached provider JSON doesn't include the richer fields
                    // our UI needs (customer summary / open-closed / service badges), force a
                    // refresh from Google rather than serving stale/minimal cached objects.
                    if (!cacheHasRichFields) {
                        searchCacheExpired = true;
                    } else if (!supabase) {
                        searchCacheExpired = true;
                    } else {
                        const placeIdsFromCache = searchRow.place_ids as string[];
                        const { data: providerRows } = await supabase
                            .from('providers')
                            .select('*')
                            .in('google_place_id', placeIdsFromCache);
                        const rowsByPlaceId = new Map(
                            (providerRows || []).map((r: any) => [
                                normalizePlaceId(r.google_place_id),
                                r,
                            ])
                        );
                        const orderedRows = placeIdsFromCache
                            .map((id) => rowsByPlaceId.get(normalizePlaceId(id)))
                            .filter((row: any) => {
                                if (!row) return false;
                                const count = row.rating_count ?? 0;
                                return typeof count === 'number' && count >= 5;
                            });
                        if (orderedRows.length > 0) {
                            const routingFromCache = (searchRow.routing_summaries || []) as any[];
                            places = orderedRows.map((row: any) => ({
                                id: row.google_place_id,
                                displayName: { text: row.name },
                                formattedAddress: row.address || '',
                                addressComponents: [],
                                rating: row.rating,
                                userRatingCount: row.rating_count ?? 0,
                                nationalPhoneNumber: row.phone,
                                internationalPhoneNumber: null,
                                websiteUri: row.website,
                                location:
                                    row.latitude != null && row.longitude != null
                                        ? { latitude: row.latitude, longitude: row.longitude }
                                        : null,
                                reviewSummary: row.summary ? { text: { text: row.summary } } : null,
                                editorialSummary: null,
                                types: [],
                                reviews: [],
                                photos: [],
                                regularOpeningHours: {
                                    weekdayDescriptions: [],
                                    nextOpenTime: null,
                                },
                            }));
                            routingSummaries =
                                routingFromCache.length === places.length
                                    ? routingFromCache
                                    : places.map(() => ({}));
                            data = { nextPageToken: searchRow.next_page_token ?? null };
                            cachedData = orderedRows;
                        }
                    }
                } else {
                    searchCacheExpired = true;
                    logAiEvent({
                        endpoint: 'providers',
                        status: 'ok',
                        durationMs: 0,
                        meta: {
                            kind: 'search_cache_expired',
                            searchCacheKey,
                            ageMs,
                            ttlMs: SEARCH_CACHE_TTL_MS,
                            lat: latR,
                            lng: lngR,
                            trade,
                            radius,
                        },
                    });
                }
            }
        }

        if (places.length === 0) {
            // 2. Fetch providers from Google Places API
        const url = `https://places.googleapis.com/v1/places:searchText`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                    'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.location,places.types,places.reviews,places.editorialSummary,places.reviewSummary,places.regularOpeningHours,places.currentOpeningHours,routingSummaries,nextPageToken',
            },
            body: JSON.stringify({
                textQuery: searchQuery,
                ...(pageToken && { pageToken }),
                routingParameters: {
                    origin: {
                        latitude: lat,
                        longitude: lng,
                    },
                },
                locationBias: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: radius,
                    },
                },
                pageSize: 20,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Google Places API Error Details: ${errorText}`);
            throw new Error(`Google Places API error (${response.status}): ${errorText}`);
        }

            data = await response.json();
            const rawPlaces = data.places || [];
            const rawRouting = data.routingSummaries || [];

            // Filter out retail stores (e.g. Builders Warehouse) — we want contractors/service providers, not shops that sell parts
            const filtered: { place: any; routing: any }[] = [];
            rawPlaces.forEach((p: any, i: number) => {
                const types = (p.types || []) as string[];
                const hasRetailType = types.some((t: string) => RETAIL_TYPES.has(t));
                if (!hasRetailType) filtered.push({ place: p, routing: rawRouting[i] });
            });
            places = filtered.map((f) => f.place);
            routingSummaries = filtered.map((f) => f.routing);

            const seenPlaceIds = new Set<string>(places.map((p: any) => String(p?.id ?? '')));
            let nextSearchToken = (data.nextPageToken as string | undefined) || null;
            while (
                nextSearchToken &&
                !pageToken &&
                textSearchExtraPagesFetched < TEXT_SEARCH_MAX_EXTRA_PAGES &&
                places.length < 55
            ) {
                textSearchExtraPagesFetched += 1;
                const responseMore = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask':
                            'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.location,places.types,places.reviews,places.editorialSummary,places.reviewSummary,places.regularOpeningHours,places.currentOpeningHours,routingSummaries,nextPageToken',
                    },
                    body: JSON.stringify({
                        textQuery: searchQuery,
                        pageToken: nextSearchToken,
                        routingParameters: {
                            origin: {
                                latitude: lat,
                                longitude: lng,
                            },
                        },
                        locationBias: {
                            circle: {
                                center: { latitude: lat, longitude: lng },
                                radius: radius,
                            },
                        },
                        pageSize: 20,
                    }),
                });
                if (!responseMore.ok) break;
                const dataMore = await responseMore.json();
                const rawMore = dataMore.places || [];
                const routeMore = dataMore.routingSummaries || [];
                rawMore.forEach((p: any, i: number) => {
                    const pid = String(p?.id ?? '');
                    if (!pid || seenPlaceIds.has(pid)) return;
                    const types = (p.types || []) as string[];
                    const hasRetailType = types.some((t: string) => RETAIL_TYPES.has(t));
                    if (hasRetailType) return;
                    seenPlaceIds.add(pid);
                    places.push(p);
                    routingSummaries.push(routeMore[i] ?? {});
                });
                nextSearchToken = (dataMore.nextPageToken as string | undefined) || null;
                data.nextPageToken = dataMore.nextPageToken ?? null;
            }

            if (supabase && !pageToken && places.length > 0) {
                pendingCacheWrite = {
                    key: buildSearchCacheKey({
                        lat: Number(lat),
                        lng: Number(lng),
                        tradeNorm,
                        detailKeyForCache,
                        radius: Number(radius),
                    }),
                    placeIds: places.map((p: any) => p.id),
                    routing: routingSummaries,
                    nextToken: data.nextPageToken ?? null,
                };
            }
        }

        if (places.length === 0) {
            const durationMs = Date.now() - startedAt;
            logAiEvent({
                endpoint: 'providers',
                status: 'ok',
                durationMs,
                meta: {
                    trade,
                    providersCount: 0,
                    searchCacheHit,
                    searchCacheExpired,
                    usedSearchCache: searchCacheHit,
                    usedGoogleApi: !searchCacheHit,
                },
            });
            return NextResponse.json({ providers: [] });
        }

        const rawPlacesMergedCount = places.length;

        // 3. Fast-path mapping for MVP: skip enrichment and heavy caching.
        const mapPlacesToFastProviders = (
            minRatingCount: number,
            relevanceMode: 'strict' | 'relaxed' = 'strict'
        ) =>
            places
                .map((place: any, index: number) => {
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
                const radiusKm = radius / 1000;
                const straightLineKm = greatCircleDistanceKm(
                    Number(lat),
                    Number(lng),
                    placeLat,
                    placeLng
                );
                if (straightLineKm > radiusKm + 0.5) {
                    return null;
                }

                let distanceKm: number | null = null;
                let durationText = '';
                const leg = routingSummaries[index]?.legs?.[0];
                const meters = leg?.distanceMeters;
                if (typeof meters === 'number') {
                    distanceKm = Number((meters / 1000).toFixed(1));
                    if (meters > radius) {
                        return null;
                    }
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
                    place.displayName?.text || 'Unknown Provider'
                );
                const ratingCount = place.userRatingCount ?? 0;

                if (ratingCount < minRatingCount) {
                    return null;
                }
                const services = getPlaceServices(place.types);
                const weekdayDescriptionsRaw = (place.regularOpeningHours as any)?.weekdayDescriptions;
                const weekdayDescriptionsFormatted = formatWeekdayDescriptionsTo24h(weekdayDescriptionsRaw) ?? [];
                const isOpen = isOpenNowFromWeekdayDescriptions(weekdayDescriptionsFormatted, new Date());
                // "Scandio Summary" comes from our AI review summariser.
                // Fallback: if the AI summary is missing (e.g. summarisation timeout/failure),
                // show Google's editorial/review summary so the UI doesn't stay as a skeleton.
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
                .filter(Boolean) as Array<{
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
            services: { short: string; full: string }[];
            isOpen: boolean | null;
        }>;

        const providerLimit = getProviderResultLimitByRadius(radius);
        const baseMinRating = radius >= 20_000 ? 3 : 5;
        let minRatingUsed = baseMinRating;
        let relevanceModeUsed: 'strict' | 'relaxed' = 'strict';
        let fastProviders = mapPlacesToFastProviders(baseMinRating, 'strict');
        if (baseMinRating > 3 && fastProviders.length < providerLimit) {
            minRatingUsed = 3;
            fastProviders = mapPlacesToFastProviders(3, 'strict');
        }
        // Final fallback for sparse areas: include lower-review providers rather
        // than returning an unusably small list (quality is still handled by ranking).
        if (fastProviders.length < providerLimit) {
            minRatingUsed = 1;
            fastProviders = mapPlacesToFastProviders(1, 'strict');
        }
        // If strict relevance still starves the list, relax semantic matching while
        // keeping hard safety exclusions (banned categories + geo radius).
        if (fastProviders.length < providerLimit) {
            relevanceModeUsed = 'relaxed';
            fastProviders = mapPlacesToFastProviders(minRatingUsed, 'relaxed');
        }

        // Pre-fetched providers rows — fired in parallel with provider_cache below to save a round-trip.
        let prefetchedProvRows: { id: string; google_place_id: string }[] | null = null;
        const dbReader = adminSupabase || supabase;
        if (dbReader && fastProviders.length > 0) {
            const placeIds = fastProviders
                .map((p) => toGooglePlaceId(p.placeId))
                .filter(Boolean);
            if (placeIds.length > 0) {
                // 2.1: Fire provider_cache and providers in parallel — same input set, independent data.
                const [cacheResult, provResult] = await Promise.all([
                    dbReader
                        .from('provider_cache')
                        .select('google_place_id, profile_completeness, specialisations')
                        .in('google_place_id', placeIds),
                    dbReader
                        .from('providers')
                        .select('id, google_place_id')
                        .eq('is_active', true)
                        .in('google_place_id', placeIds),
                ]);
                const cacheRows = cacheResult.data;
                prefetchedProvRows = (provResult.data as { id: string; google_place_id: string }[]) ?? null;
                const completenessByGoogleId = new Map<string, number>(
                    (cacheRows || []).map((r: any) => [
                        String(r.google_place_id),
                        Number(r.profile_completeness ?? 0),
                    ])
                );
                // R5: map specialisations for relevance scoring
                const specialisationsByGoogleId = new Map<string, string[]>(
                    (cacheRows || [])
                        .filter((r: any) => Array.isArray(r.specialisations) && r.specialisations.length > 0)
                        .map((r: any) => [String(r.google_place_id), r.specialisations as string[]])
                );
                fastProviders.forEach((p) => {
                    const gid = toGooglePlaceId(p.placeId);
                    const completeness = completenessByGoogleId.get(gid) ?? 0;
                    (p as any).profileCompleteness = Math.max(0, Math.min(3, completeness));
                    const specs = specialisationsByGoogleId.get(gid);
                    if (specs) (p as any).specialisations = specs;
                });
            }
        }

        if (fastProviders.length === 0) {
            const durationMs = Date.now() - startedAt;
            logAiEvent({
                endpoint: 'providers',
                status: 'ok',
                durationMs,
                meta: {
                    trade,
                    providersCount: 0,
                    searchCacheHit,
                    searchCacheExpired,
                    usedSearchCache: searchCacheHit,
                    usedGoogleApi: !searchCacheHit,
                },
            });
            return NextResponse.json({ providers: [] });
        }

        // Rank by weighted composite: relevance 40%, Bayesian rating 30%, proximity 20%, recency 10%.
        // Result count scales with radius so wider searches can surface meaningfully more providers.
        const rankedProviders = rankProviders(fastProviders as ProviderItem[], providerLimit, {
            tradeDetail: tradeDetailRaw,
            trade: tradeNorm,
        });
        const limitedProviders = rankedProviders.map((p) => ({ ...p }));

        // AI summaries from real review text: use Supabase reviews when we have them; otherwise
        // Place Details (same request). This must run even when providers are not in Supabase yet
        // (previously we bailed out and left the template "Customers typically…" summary).
        if (limitedProviders.length > 0) {
            try {
                const googleIds = limitedProviders
                    .map((p) =>
                        typeof p.placeId === 'string' ? toGooglePlaceId(p.placeId) : ''
                    )
                    .filter(Boolean);

                let providerIdByGoogle = new Map<string, string>();

                if (dbReader) {
                    // Use the providers result that was pre-fetched in parallel with provider_cache above.
                    const provRows = prefetchedProvRows;
                    providerIdByGoogle = new Map<string, string>(
                        (provRows || []).map((r: any) => [String(r.google_place_id), String(r.id)])
                    );

                    // Attach internal `providerId` (providers.id) so the frontend can route to `/pro/[id]`
                    // using the database id, not the Google place id.
                    limitedProviders.forEach((p: any) => {
                        const rawPid = p?.placeId || p?.place_id;
                        if (typeof rawPid !== 'string') return;
                        const googlePlaceId = toGooglePlaceId(rawPid);
                        const providerId = providerIdByGoogle.get(googlePlaceId);
                        if (providerId) p.providerId = providerId;
                    });

                    const providerIds = Array.from(providerIdByGoogle.values());
                    const providerIdList = providerIds.map((x) => String(x));
                    const weekKey = getISOWeekKey();
                    const rotationPids = (limitedProviders as any[])
                        .map((p) => p.providerId)
                        .filter(Boolean) as string[];

                    // 2.1: Parallelise scandio review count + rotation tokens fetch — both need
                    // providerIds but are independent of each other.
                    const [scandioData, tokenRows] = await Promise.all([
                        providerIdList.length > 0
                            ? dbReader
                                .from('reviews')
                                .select('provider_id')
                                .eq('source', 'scandio')
                                .eq('status', 'approved')
                                .in('provider_id', providerIdList)
                                .then((r) => r.data ?? null, () => null as null)
                            : Promise.resolve(null as null),
                        rotationPids.length > 0
                            ? dbReader
                                .from('provider_rotation_tokens')
                                .select('provider_id, tokens_remaining, last_shown_at')
                                .eq('week_key', weekKey)
                                .in('provider_id', rotationPids)
                                .then((r) => r.data ?? null, () => null as null)
                            : Promise.resolve(null as null),
                    ]);

                    // Attach Scandio review counts
                    const scandioReviewCountByProviderId = new Map<string, number>();
                    if (Array.isArray(scandioData)) {
                        for (const r of scandioData) {
                            const pid = typeof (r as any)?.provider_id === 'string' ? (r as any).provider_id : null;
                            if (!pid) continue;
                            scandioReviewCountByProviderId.set(
                                pid,
                                (scandioReviewCountByProviderId.get(pid) ?? 0) + 1
                            );
                        }
                    }
                    // Attach to every provider in the response so the frontend can show:
                    // (Google total reviews) + (all Scandio reviews stored in backend).
                    (limitedProviders as any[]).forEach((p: any) => {
                        const pid = typeof p?.providerId === 'string' ? p.providerId : null;
                        p.scandioReviewCount = pid ? scandioReviewCountByProviderId.get(pid) ?? 0 : 0;
                    });

                    // ── Soft rotation (token bucket) ──────────────────────────────────────
                    // Each provider starts each ISO week with 5 tokens. Being included in a
                    // result set costs 1 token. Depleted providers (0 tokens) are moved to
                    // the back of the list so under-exposed providers can surface instead.
                    // We never fully exclude a depleted provider — if there are no
                    // alternatives the carousel will still show them.
                    {
                        if (tokenRows && tokenRows.length > 0) {
                            const tokenMap = new Map<string, number>(
                                tokenRows.map((r: any) => [
                                    String(r.provider_id),
                                    Number(r.tokens_remaining ?? 5),
                                ])
                            );
                            const lastShownMap = new Map<string, string>(
                                tokenRows
                                    .filter((r: any) => r.last_shown_at)
                                    .map((r: any) => [
                                        String(r.provider_id),
                                        String(r.last_shown_at),
                                    ])
                            );

                            // Attach last_shown_at as lastMatchedAt for recency scoring
                            // on future requests (stored in the providers table later).
                            (limitedProviders as any[]).forEach((p) => {
                                const pid = p.providerId;
                                if (pid && lastShownMap.has(pid)) {
                                    p.lastMatchedAt = lastShownMap.get(pid);
                                }
                            });

                            // Stable sort: depleted providers sink to the end while the
                            // original composite-score order is preserved within each tier.
                            (limitedProviders as any[]).sort((a, b) => {
                                const tA = tokenMap.get(a.providerId) ?? 5;
                                const tB = tokenMap.get(b.providerId) ?? 5;
                                // Both depleted or both healthy → preserve order
                                if (tA > 0 && tB > 0) return 0;
                                if (tA === 0 && tB === 0) return 0;
                                // Non-depleted before depleted
                                return tA > 0 ? -1 : 1;
                            });
                        }

                        // Async: deduct 1 token from each provider now being shown.
                        // Also record last_shown_at so the recency signal stays current.
                        if (rotationPids.length > 0) {
                            createSupabaseAdminClient()
                                .then(async (adminClient) => {
                                    const nowIso = new Date().toISOString();
                                    const upsertRows = rotationPids.map((pid) => ({
                                        provider_id: pid,
                                        week_key: weekKey,
                                        tokens_remaining: Math.max(
                                            0,
                                            ((tokenRows ?? []).find((r: any) => r.provider_id === pid)
                                                ?.tokens_remaining ?? 5) - 1
                                        ),
                                        last_shown_at: nowIso,
                                    }));
                                    await adminClient
                                        .from('provider_rotation_tokens')
                                        .upsert(upsertRows, {
                                            onConflict: 'provider_id,week_key',
                                        });
                                    // Also update last_matched_at on the providers table so
                                    // the recency signal persists across weeks.
                                    await adminClient
                                        .from('providers')
                                        .upsert(
                                            rotationPids.map((pid) => ({
                                                id: pid,
                                                last_matched_at: nowIso,
                                            })),
                                            { onConflict: 'id' }
                                        );
                                })
                                .catch(() => {
                                    // Best-effort; never block the response.
                                });
                        }

                        // Keep the result set aligned with the configured per-radius cap.
                        if (limitedProviders.length > providerLimit) {
                            limitedProviders.splice(providerLimit);
                        }
                    }
                    // ─────────────────────────────────────────────────────────────────────

                }

                // Helpful diagnostics in response (UI ignores unknown fields).
                logAiEvent({
                    endpoint: 'providers',
                    status: 'ok',
                    durationMs: Date.now() - startedAt,
                    meta: {
                        trade,
                        limitedProvidersCount: limitedProviders.length,
                    rankingDecision: limitedProviders.map((p: any, idx: number) => ({
                        rank: idx + 1,
                        providerId: p.providerId ?? null,
                        placeId: p.placeId,
                        score: Number(
                            compositeScore(
                                p as ProviderItem,
                                tradeDetailRaw,
                                tradeNorm
                            ).toFixed(4)
                        ),
                        profileCompleteness: p.profileCompleteness ?? 0,
                    })),
                    },
                });
            } catch {
                // Ignore failures; API still returns providers (possibly without summaries).
            }
        }

        if (pendingCacheWrite && supabase && !pageToken && limitedProviders.length > 0) {
            const { key, placeIds, routing, nextToken } = pendingCacheWrite;
            createSupabaseAdminClient()
                .then((adminSupabase) =>
                    adminSupabase.from('provider_search_cache').upsert(
                        {
                            query_key: key,
                            place_ids: placeIds,
                            routing_summaries: routing,
                            next_page_token: nextToken,
                            providers: limitedProviders,
                            created_at: new Date().toISOString(),
                        },
                        { onConflict: 'query_key' }
                    )
                )
                .catch((e) => console.warn('Provider search cache write skipped:', (e as Error).message));
        }

        // Final guardrail: never return (or persist) summaries with em-dashes/curly quotes.
        limitedProviders.forEach((p: any) => {
            p.summary = sanitizeCustomerSummary(String(p?.summary ?? ''));
        });

        // Best-effort: persist returned providers to unified `providers` table for later reuse.
        // Do not block the response if DB is slow/unavailable.
        if (!pageToken && limitedProviders.length > 0) {
            const placeById = new Map<string, any>();
            for (const pl of places || []) {
                const pid = normalizePlaceId(pl?.id || '');
                if (pid) placeById.set(pid, pl);
            }

            await createSupabaseAdminClient()
                .then(async (adminSupabase) => {
                    const nowIso = new Date().toISOString();
                    const rows = limitedProviders.map((p) => {
                        const row = p as ProviderItem & { services?: unknown[] };
                        const googlePlaceId =
                            typeof row.placeId === 'string' && row.placeId.startsWith('places/')
                                ? row.placeId
                                : `places/${row.placeId}`;
                        const openingHours = (row as any).weekdayDescriptions;
                        const hoursArray = formatWeekdayDescriptionsTo24h(openingHours) ?? [];

                        return {
                            source: 'google',
                            google_place_id: googlePlaceId,
                            name: normalizeProviderName(row.name),
                            address: row.address,
                            rating: row.rating,
                            rating_count: row.ratingCount ?? 0,
                            phone: row.phone,
                            website: row.website,
                            latitude: row.latitude,
                            longitude: row.longitude,
                            summary: row.summary ?? '',
                            services: row.services ?? [],
                            service_categories: canonicalServiceLabel ? [canonicalServiceLabel] : [],
                            weekday_descriptions: hoursArray.length > 0 ? hoursArray : null,
                            last_updated: nowIso,
                            updated_at: nowIso,
                        };
                    });

                    const upsertRes = await adminSupabase.from('providers').upsert(rows, {
                        onConflict: 'google_place_id',
                    });
                    if (upsertRes.error) return upsertRes;

                    // Load provider ids so we can upsert reviews (reviews.provider_id FK).
                    // R6: also load reviews_synced_at to decide whether a fresh Google review
                    // import is needed even when reviews already exist in the database.
                    const googleIds = rows.map((r) => r.google_place_id).filter(Boolean);
                    const { data: providerRows, error: provErr } = await adminSupabase
                        .from('providers')
                        .select('id, google_place_id, reviews_synced_at')
                        .eq('is_active', true)
                        .in('google_place_id', googleIds);
                    if (provErr) {
                        console.warn('Reviews upsert skipped:', provErr.message);
                        return upsertRes;
                    }
                    const providerIdByGoogle = new Map<string, string>(
                        (providerRows || []).map((r: any) => [String(r.google_place_id), String(r.id)])
                    );
                    // R6: track when each provider last had a fresh Google review import.
                    const reviewSyncedAtByGoogleId = new Map<string, string | null>(
                        (providerRows || []).map((r: any) => [
                            String(r.google_place_id),
                            r.reviews_synced_at ?? null,
                        ])
                    );

                    // Ensure the API response includes internal `providerId` so the frontend can
                    // route to `/pro/[id]` using providers.id rather than the Google place id.
                    limitedProviders.forEach((p: any) => {
                        const rawPid = p?.placeId || p?.place_id;
                        if (typeof rawPid !== 'string') return;
                        const googlePlaceId = toGooglePlaceId(rawPid);
                        const providerId = providerIdByGoogle.get(googlePlaceId);
                        if (providerId) p.providerId = providerId;
                    });

                    // Background website enrichment for providers that have a website but
                    // no enriched content yet (first ingestion path). This builds the rich
                    // profile data (about, past work, AI-extracted specialisations) that
                    // improves both the provider card and future relevance scoring.
                    // Cap at 2 per request so we don't hammer external sites on busy periods.
                    {
                        const toEnrich = rows
                            .filter((r) => r.website && !r.summary)
                            .slice(0, 2)
                            .map((r) => providerIdByGoogle.get(r.google_place_id))
                            .filter(Boolean) as string[];

                        if (toEnrich.length > 0) {
                            import('@/lib/refresh-provider-website')
                                .then(async ({ refreshProviderWebsiteById }) => {
                                    for (const pid of toEnrich) {
                                        await refreshProviderWebsiteById(pid).catch(() => {});
                                    }
                                })
                                .catch(() => {});
                        }
                    }

                    const reviewPayload: any[] = [];
                    const cutoffMs = Date.now() - TWENTY_FOUR_MONTHS_MS;

                    for (const googlePlaceId of googleIds) {
                        const providerId = providerIdByGoogle.get(googlePlaceId);
                        if (!providerId) continue;
                        const pl = placeById.get(normalizePlaceId(googlePlaceId));
                        let revs = (pl?.reviews || []) as any[];
                        // R6: also refresh when existing reviews are stale (> 7 days since last sync).
                        const syncedAt = reviewSyncedAtByGoogleId.get(googlePlaceId);
                        const isReviewStale =
                            !syncedAt ||
                            Date.now() - new Date(syncedAt).getTime() > REVIEW_SYNC_TTL_MS;
                        if (!Array.isArray(revs) || revs.length === 0 || isReviewStale) {
                            // Fallback / refresh: Places search results can omit review bodies for some
                            // rows, or the stored data may be > 7 days old. Pull place details directly
                            // so review sync is up-to-date.
                            const freshRevs = await fetchPlaceReviewsFromGoogle(googlePlaceId, apiKey);
                            if (freshRevs.length > 0) revs = freshRevs;
                        }
                        for (const rev of revs) {
                            const publishTime = rev?.publishTime ? new Date(rev.publishTime).getTime() : null;
                            if (publishTime && publishTime < cutoffMs) {
                                continue;
                            }

                            const sourceRef =
                                rev?.name ||
                                `${googlePlaceId}:${rev?.publishTime || rev?.relativePublishTimeDescription || ''}:${rev?.authorAttribution?.displayName || rev?.authorAttribution?.name || ''}`;
                            const rawBody =
                                (typeof rev?.originalText?.text === 'string' && rev.originalText.text) ||
                                (typeof rev?.text?.text === 'string' && rev.text.text) ||
                                (typeof rev?.text === 'string' && rev.text) ||
                                '';
                            const originalBody = String(rawBody || '').trim();
                            if (!originalBody) continue;

                            const originalName =
                                (rev?.authorAttribution?.displayName as string) ||
                                (rev?.authorAttribution?.name as string) ||
                                null;

                            reviewPayload.push({
                                provider_id: providerId,
                                source: 'google',
                                source_ref: String(sourceRef || '').slice(0, 512),
                                status: 'approved',
                                reviewer_name: originalName,
                                rating: typeof rev?.rating === 'number' ? rev.rating : null,
                                body: originalBody,
                                relative_publish_time_description:
                                    rev?.relativePublishTimeDescription || null,
                                published_at: rev?.publishTime || null,
                                raw: rev ?? null,
                                updated_at: nowIso,
                            });
                        }
                    }

                    if (reviewPayload.length > 0) {
                        const { error: reviewsErr } = await adminSupabase
                            .from('reviews')
                            .upsert(reviewPayload, {
                                onConflict: 'provider_id,source,source_ref',
                            });
                        if (reviewsErr) {
                            console.warn('Reviews upsert skipped:', reviewsErr.message);
                        }

                        // R6: stamp reviews_synced_at so future requests know when reviews were last
                        // fetched from Google, enabling staleness-based refresh decisions.
                        const syncedProviderIds = Array.from(
                            new Set(reviewPayload.map((r) => r.provider_id))
                        );
                        if (syncedProviderIds.length > 0) {
                            // Non-fatal — reviews are already stored; stamp is best-effort.
                            try {
                                await adminSupabase
                                    .from('providers')
                                    .update({ reviews_synced_at: nowIso })
                                    .in('id', syncedProviderIds);
                            } catch {
                                // ignore
                            }
                        }

                        // Enforce 24-month window & 50-review cap for all affected providers.
                        const cutoffIso = new Date(cutoffMs).toISOString();
                        const { data: affectedProviders } = await adminSupabase
                            .from('reviews')
                            .select('provider_id')
                            .eq('source', 'google')
                            .in(
                                'provider_id',
                                Array.from(new Set(reviewPayload.map((r) => r.provider_id)))
                            );

                        const uniqueProviderIds = Array.from(
                            new Set((affectedProviders || []).map((r: any) => r.provider_id))
                        );

                        for (const pid of uniqueProviderIds) {
                            await adminSupabase
                                .from('reviews')
                                .delete()
                                .eq('provider_id', pid)
                                .eq('source', 'google')
                                .lt('published_at', cutoffIso);

                            const { data: recentRows } = await adminSupabase
                                .from('reviews')
                                .select('id, published_at')
                                .eq('provider_id', pid)
                                .eq('source', 'google')
                                .order('published_at', { ascending: false })
                                .limit(60);

                            if (recentRows && recentRows.length > 50) {
                                const idsToDelete = recentRows.slice(50).map((r: any) => r.id);
                                if (idsToDelete.length > 0) {
                                    await adminSupabase.from('reviews').delete().in('id', idsToDelete);
                                }
                            }
                        }
                    }

                    return upsertRes;
                })
                .then(({ error }) => {
                    if (error) {
                        console.warn('Providers table upsert skipped:', error.message);
                    }
                })
                .catch((e) => console.warn('Providers table upsert skipped:', (e as Error).message));
        }

        const durationMs = Date.now() - startedAt;
        logAiEvent({
            endpoint: 'providers',
            status: 'ok',
            durationMs,
            meta: {
                trade,
                tradeDetail: tradeDetailRaw || undefined,
                providersCount: limitedProviders.length,
                enrichedCount: 0,
                missingPlacesCount: 0,
                usedEnrichment: false,
                searchCacheHit,
                searchCacheExpired,
                usedSearchCache: searchCacheHit,
                usedGoogleApi: !searchCacheHit,
                rawPlacesMergedCount: rawPlacesMergedCount,
                textSearchExtraPagesFetched,
                minReviewThreshold: minRatingUsed,
                relevanceMode: relevanceModeUsed,
                fastProviderCountBeforeRank: fastProviders.length,
            },
        });

        const responseBody: ProvidersResponseBody = {
            providers: limitedProviders,
            nextPageToken: data.nextPageToken || null,
            searchQuery,
            tradeDetail: tradeDetailRaw || null,
        };
        return NextResponse.json(responseBody);
    } catch (error: unknown) {
        logAiEvent({
            endpoint: 'providers',
            status: 'error',
            durationMs: 0,
            meta: { error: (error as Error)?.message || 'Unknown error' },
        });
        console.error('Places API Error:', error);
        return NextResponse.json(
            { error: (error as Error)?.message || 'Failed to fetch providers' },
            { status: 500 }
        );
    }
}
