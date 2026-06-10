/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { logAiEvent } from '@/lib/ai/ai-logging';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sanitizeCustomerSummary } from '@/lib/providers/review-summary';
import { formatBusinessName } from '@/lib/utils';
import { formatWeekdayDescriptionsTo24h } from '@/lib/providers/format-weekday-descriptions';
import { isOpenNowFromWeekdayDescriptions } from '@/lib/providers/open-status';
import { buildProviderQuery } from '@/lib/providers/query-builder';
import { rankProviders, getISOWeekKey, compositeScore } from '@/lib/providers/ranking';
import type { ProviderItem, ProvidersResponseBody } from '@/lib/providers/contracts';
import { buildSearchCacheKey } from '@/lib/providers/cache';
import { toGooglePlaceId } from '@/lib/providers/persistence';
import { normalizePlaceId } from '@/lib/providers/place-id';
import {
    SEARCH_CACHE_TTL_MS,
} from '@/lib/providers/constants';
import {
    greatCircleDistanceKm,
    getProviderResultLimitByRadius,
} from './handler-distance';
import {
    fetchPlacesSearchText,
    isTransientPlacesHttpStatus,
    resolvePlacesApiKey,
} from './handler-places-client';
import { selectFastProviders } from './handler-fast-map';
import { parseProvidersRequest } from './handler-request';
import { performPlacesSearch } from './handler-places-fetch';
import { scheduleProvidersBackgroundSync } from './handler-background-sync';

export async function POST(req: NextRequest) {
    // ── Rate limit ─────────────────────────────────────────────────────────────
    const limited = await checkRateLimit(req, 'providers');
    if (limited) return limited;

    try {
        const t0 = Date.now();
        const stageTimings: Record<string, number> = {};
        const logStage = (_label: string, stageKey?: string) => {
            const elapsed = Date.now() - t0;
            if (stageKey) stageTimings[stageKey] = elapsed;
        };
        const raw = await req.text();
        const parseResult = await parseProvidersRequest(raw);
        if (parseResult.kind === 'response') return parseResult.response;
        const body = parseResult.parsed;
        const { quickMode, radius } = parseResult;

        const startedAt = Date.now();
        let searchCacheHit = false;
        let searchCacheExpired = false;
        let textSearchExtraPagesFetched = 0;
        const {
            lat,
            lng,
            trade,
            pageToken,
            searchQuery: providedSearchQuery,
            tradeDetail,
        } = body;
        logStage('body parsed', 'body_parsed');
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

        const { apiKey, source: apiKeySource } = resolvePlacesApiKey();
        if (!apiKey) {
            console.error(
                'Google Places API key is missing. Set `GOOGLE_PLACES_API_KEY` (preferred) or `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`.',
            );
            return NextResponse.json(
                {
                    error:
                        'Google Places API key is not configured (expected `GOOGLE_PLACES_API_KEY` or `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`)',
                },
                { status: 500 },
            );
        }

        console.warn(
            JSON.stringify({ type: 'providers_api_key_source', source: apiKeySource, keyLength: apiKey.length })
        );

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
        const attachDebugTiming = (
            body: ProvidersResponseBody
        ): ProvidersResponseBody => {
            if (process.env.NODE_ENV !== 'development') return body;
            return {
                ...body,
                debugTiming: {
                    totalMs: Date.now() - t0,
                    stages: { ...stageTimings },
                    searchCacheHit,
                    placesCount: places.length,
                    providersCount: Array.isArray(body.providers) ? body.providers.length : 0,
                },
            };
        };

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
                        // Use cached names as-is; avoid re-normalizing and unintentionally
                        // changing user-visible/admin-edited display names on repeat outputs.
                        const normalizedCached = (cachedProviders || []).map((p: any) => p);
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
                                                    weekday_descriptions: hours.length > 0 ? hours : null,
                                                    last_updated: new Date().toISOString(),
                                                    updated_at: new Date().toISOString(),
                                                };
                                            })
                                            .filter((r): r is NonNullable<typeof r> => r !== null),
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
                                        .select('id, google_place_id, name, summary, certifications')
                                        .in('google_place_id', googlePlaceIds);
                                    const idByGoogle = new Map(
                                        (providerRowsForIds || []).map((r: any) => [
                                            String(r.google_place_id),
                                            String(r.id),
                                        ])
                                    );
                                    const nameByGoogle = new Map<string, string>(
                                        (providerRowsForIds || [])
                                            .filter(
                                                (r: any) =>
                                                    typeof r?.google_place_id === 'string' &&
                                                    typeof r?.name === 'string' &&
                                                    r.name.trim().length > 0
                                            )
                                            .map((r: any) => [String(r.google_place_id), String(r.name).trim()])
                                    );
                                    const summaryByGoogle = new Map<string, string>(
                                        (providerRowsForIds || [])
                                            .filter(
                                                (r: any) =>
                                                    typeof r?.google_place_id === 'string' &&
                                                    typeof r?.summary === 'string' &&
                                                    r.summary.trim().length > 0
                                            )
                                            .map((r: any) => [
                                                String(r.google_place_id),
                                                String(r.summary).trim(),
                                            ])
                                    );
                                    // Build certifications map from providers.certifications column
                                    const certsByGoogle = new Map<string, Array<{ slug: string; label: string }>>(
                                        (providerRowsForIds || [])
                                            .filter((r: any) => Array.isArray(r.certifications) && r.certifications.length > 0)
                                            .map((r: any) => [
                                                String(r.google_place_id),
                                                (r.certifications as string[])
                                                    .filter((c) => typeof c === 'string' && c.trim())
                                                    .map((c: string) => ({
                                                        slug: c.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
                                                        label: c.trim(),
                                                    })),
                                            ])
                                    );
                                    providersWithIds = (normalizedCached || []).map((p: any) => {
                                        const pid = p?.placeId || p?.place_id;
                                        if (!pid || typeof pid !== 'string') return p;
                                        const gId = pid.startsWith('places/') ? pid : `places/${pid}`;
                                        const dbName = nameByGoogle.get(gId);
                                        const dbSummary = summaryByGoogle.get(gId);
                                        const hasCachedSummary =
                                            typeof p?.summary === 'string' && p.summary.trim().length > 0;
                                        const certs = certsByGoogle.get(gId);
                                        return {
                                            ...p,
                                            providerId: idByGoogle.get(gId) || p.providerId,
                                            ...(dbName ? { name: dbName } : {}),
                                            ...(!hasCachedSummary && dbSummary
                                                ? { summary: dbSummary }
                                                : {}),
                                            ...(certs && certs.length > 0 ? { certifications: certs } : {}),
                                        };
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

                            // Attach provider_images to cache-hit results so the match card carousel works.
                            // This is a fast targeted query — only runs for ranked providers with a providerId.
                            try {
                                const rankedProviderIds = reRankedCached
                                    .map((p: any) => p.providerId)
                                    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
                                if (rankedProviderIds.length > 0 && supabase) {
                                    const supabasePublicBase = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
                                    const { data: imgRows } = await supabase
                                        .from('provider_images')
                                        .select('provider_id, bucket, path, caption, sort_order')
                                        .in('provider_id', rankedProviderIds)
                                        .eq('status', 'approved')
                                        .order('sort_order', { ascending: true });
                                    if (Array.isArray(imgRows) && imgRows.length > 0) {
                                        const galleryById = new Map<string, Array<{ url: string; caption?: string }>>();
                                        for (const row of imgRows as Array<{ provider_id: string; bucket?: string | null; path?: string | null; caption?: string | null }>) {
                                            if (!row.provider_id || !row.path) continue;
                                            const bucket = typeof row.bucket === 'string' ? row.bucket.trim() : '';
                                            const path = row.path.trim().replace(/^\/+/, '');
                                            if (!bucket || !path || !supabasePublicBase) continue;
                                            const url = `${supabasePublicBase}/storage/v1/object/public/${bucket}/${path}`;
                                            const item = typeof row.caption === 'string' && row.caption.trim()
                                                ? { url, caption: row.caption.trim() }
                                                : { url };
                                            const arr = galleryById.get(row.provider_id) ?? [];
                                            if (arr.length < 5) arr.push(item);
                                            galleryById.set(row.provider_id, arr);
                                        }
                                        reRankedCached.forEach((p: any) => {
                                            const imgs = p.providerId ? galleryById.get(p.providerId) : undefined;
                                            if (Array.isArray(imgs) && imgs.length > 0) {
                                                p.images = imgs;
                                                p.hasWorkPhotos = true;
                                            }
                                        });
                                    }
                                }
                            } catch {
                                // Non-fatal — cache path still returns without images
                            }

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
                    } else if (supabase) {
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
                    } else {
                        searchCacheExpired = true;
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
        logStage(
            `cache lookup complete (hit=${searchCacheHit ? 'yes' : 'no'}, places=${places.length})`,
            'cache_lookup_done'
        );

        if (places.length === 0) {
            const searchResult = await performPlacesSearch({
                apiKey,
                lat: Number(lat),
                lng: Number(lng),
                radius,
                searchQuery,
                pageToken,
            });

            if (searchResult.kind === 'error') {
                console.error(`Google Places API Error Details: ${searchResult.errorText}`);
                logAiEvent({
                    endpoint: 'providers',
                    status: 'error',
                    durationMs: Date.now() - startedAt,
                    meta: {
                        error: searchResult.errorText.slice(0, 500),
                        placesHttpStatus: searchResult.status,
                    },
                });
                const message =
                    searchResult.status === 429
                        ? 'Google Places is rate-limiting requests. Try again in a moment.'
                        : 'Google Places is temporarily unavailable. Try again shortly.';
                return NextResponse.json(
                    {
                        error: message,
                        code: 'PLACES_UNAVAILABLE',
                        providers: [],
                    },
                    { status: searchResult.status === 429 ? 429 : 503 },
                );
            }

            places = searchResult.places;
            routingSummaries = searchResult.routingSummaries;
            data = { nextPageToken: searchResult.nextPageToken };
            textSearchExtraPagesFetched = searchResult.textSearchExtraPagesFetched;

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
        logStage(
            `places resolved (count=${places.length}, googleExtraPages=${textSearchExtraPagesFetched})`,
            'places_resolved'
        );

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
        const providerLimit = getProviderResultLimitByRadius(radius);
        const fastResult = selectFastProviders({
            places,
            routingSummaries,
            lat: Number(lat),
            lng: Number(lng),
            radius,
            tradeNorm,
            isBoreholeLikeDetail,
            providerLimit,
        });
        const fastProviders = fastResult.providers;
        const minRatingUsed = fastResult.minRatingUsed;
        const relevanceModeUsed = fastResult.relevanceModeUsed;
        logStage(
            `fast providers prepared (count=${fastProviders.length}, minReviews=${minRatingUsed}, mode=${relevanceModeUsed})`,
            'fast_map_done',
        );

        // Pre-fetched providers rows — fired in parallel with provider_cache below to save a round-trip.
        let prefetchedProvRows:
            | {
                  id: string;
                  google_place_id: string;
                  name?: string | null;
                  certifications?: string[] | null;
                  specialisations?: string[] | null;
              }[]
            | null = null;
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
                        // has_work_photos and images are NOT columns in provider_cache.
                        // Images come from the provider_images table via providerGalleryByProviderId.
                        .select('google_place_id, profile_completeness, specialisations')
                        .in('google_place_id', placeIds),
                    dbReader
                        .from('providers')
                        // company_size and years_in_business are NOT in providers —
                        // they live in provider_cache. Only select columns that exist.
                        // specialisations is the source of truth for ranking (claimed
                        // value when claimed, enrichment value otherwise).
                        .select('id, google_place_id, name, certifications, specialisations')
                        .eq('is_active', true)
                        .in('google_place_id', placeIds),
                ]);
                const cacheRows = cacheResult.data;
                prefetchedProvRows =
                    (provResult.data as Array<{
                        id: string;
                        google_place_id: string;
                        name?: string | null;
                        certifications?: string[] | null;
                        specialisations?: string[] | null;
                    }>) ?? null;
                const nameByGoogleId = new Map<string, string>(
                    (prefetchedProvRows || [])
                        .filter(
                            (r) =>
                                typeof r.google_place_id === 'string' &&
                                typeof r.name === 'string' &&
                                r.name.trim().length > 0
                        )
                        .map((r) => {
                            const raw = String(r.name).trim();
                            return [String(r.google_place_id), formatBusinessName(raw) || raw];
                        })
                );
                // company_size and years_in_business are not in providers table.
                const companySizeByGoogleId = new Map<string, string>();
                const yearsInBusinessByGoogleId = new Map<string, number>();
                const completenessByGoogleId = new Map<string, number>(
                    (cacheRows || []).map((r: any) => [
                        String(r.google_place_id),
                        Number(r.profile_completeness ?? 0),
                    ])
                );
                // R5: map specialisations for relevance scoring. Prefer the `providers`
                // table (the source of truth — the contractor's claimed value when the
                // profile is claimed, the enrichment value otherwise). Fall back to the
                // enrichment cache only for providers not yet written to `providers`.
                const specialisationsByGoogleId = new Map<string, string[]>();
                (prefetchedProvRows || []).forEach((r) => {
                    if (Array.isArray(r.specialisations) && r.specialisations.length > 0) {
                        specialisationsByGoogleId.set(String(r.google_place_id), r.specialisations);
                    }
                });
                (cacheRows || []).forEach((r: any) => {
                    const gid = String(r.google_place_id);
                    if (
                        !specialisationsByGoogleId.has(gid) &&
                        Array.isArray(r.specialisations) &&
                        r.specialisations.length > 0
                    ) {
                        specialisationsByGoogleId.set(gid, r.specialisations as string[]);
                    }
                });
                // has_work_photos and images are not in provider_cache — hasWorkPhotos is
                // set from provider_images rows below, and imagesByGoogleId is always empty.
                // The providerGalleryByProviderId fallback (provider_images table) is the
                // authoritative source of match-card carousel images.
                const hasWorkPhotosByGoogleId = new Map<string, boolean>();
                const imagesByGoogleId = new Map<string, Array<{ url: string; caption?: string }>>();

                // Build certifications from providers.certifications column (array of label strings).
                // provider_certifications is a separate table that doesn't exist in this schema.
                const certificationsByProviderId = new Map<
                    string,
                    Array<{ slug: string; label: string }>
                >(
                    (prefetchedProvRows || [])
                        .filter((r) => Array.isArray(r.certifications) && r.certifications!.length > 0)
                        .map((r) => [
                            r.id,
                            r.certifications!
                                .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
                                .map((c) => ({
                                    slug: c.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
                                    label: c.trim(),
                                })),
                        ])
                );
                let providerGalleryByProviderId = new Map<string, Array<{ url: string; caption?: string }>>();
                const candidateProviderIds = (prefetchedProvRows || [])
                    .map((r) => r.id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0);
                if (candidateProviderIds.length > 0) {
                    const supabasePublicBase = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
                        /\/+$/,
                        ''
                    );
                    const toPublicGalleryUrl = (bucketRaw: unknown, pathRaw: unknown): string => {
                        const bucket = typeof bucketRaw === 'string' ? bucketRaw.trim() : '';
                        const path = typeof pathRaw === 'string' ? pathRaw.trim().replace(/^\/+/, '') : '';
                        if (!bucket || !path || !supabasePublicBase) return '';
                        return `${supabasePublicBase}/storage/v1/object/public/${bucket}/${path}`;
                    };
                    const galleryResult = await dbReader
                        .from('provider_images')
                        .select('provider_id, bucket, path, caption, sort_order')
                        .in('provider_id', candidateProviderIds)
                        .eq('status', 'approved')
                        .order('sort_order', { ascending: true });
                    const galleryRows = galleryResult.data;
                    if (Array.isArray(galleryRows)) {
                        providerGalleryByProviderId = new Map();
                        for (const row of galleryRows as Array<{
                            provider_id: string;
                            bucket?: string | null;
                            path?: string | null;
                            caption?: string | null;
                        }>) {
                            if (!row?.provider_id) continue;
                            const url = toPublicGalleryUrl(row.bucket, row.path);
                            if (!url) continue;
                            const item =
                                typeof row.caption === 'string' && row.caption.trim()
                                    ? { url, caption: row.caption.trim() }
                                    : { url };
                            const existing = providerGalleryByProviderId.get(row.provider_id) ?? [];
                            if (existing.length >= 5) continue;
                            existing.push(item);
                            providerGalleryByProviderId.set(row.provider_id, existing);
                        }
                    }
                }
                const providerIdByGoogleIdEarly = new Map<string, string>(
                    (prefetchedProvRows || []).map((r) => [
                        String(r.google_place_id),
                        String(r.id),
                    ])
                );

                fastProviders.forEach((p) => {
                    const gid = toGooglePlaceId(p.placeId);
                    const completeness = completenessByGoogleId.get(gid) ?? 0;
                    (p as any).profileCompleteness = Math.max(0, Math.min(3, completeness));
                    const specs = specialisationsByGoogleId.get(gid);
                    if (specs) (p as any).specialisations = specs;
                    // Preserve admin-edited provider names from DB instead of overwriting
                    // with Google/search-cache values on every diagnosis run.
                    const dbName = nameByGoogleId.get(gid);
                    if (dbName) (p as any).name = dbName;
                    // Filter v2: structured fields that power the new filter sheet + cards.
                    const cs = companySizeByGoogleId.get(gid);
                    if (cs) (p as any).companySize = cs;
                    const yib = yearsInBusinessByGoogleId.get(gid);
                    if (typeof yib === 'number') (p as any).yearsInBusiness = yib;
                    const hasPhotos = hasWorkPhotosByGoogleId.get(gid);
                    if (typeof hasPhotos === 'boolean') (p as any).hasWorkPhotos = hasPhotos;
                    const provId = providerIdByGoogleIdEarly.get(gid);
                    if (provId) {
                        (p as any).providerId = provId;
                        if (!Array.isArray((p as any).images) || (p as any).images.length === 0) {
                            const fallbackGallery = providerGalleryByProviderId?.get(provId);
                            if (Array.isArray(fallbackGallery) && fallbackGallery.length > 0) {
                                (p as any).images = fallbackGallery;
                                (p as any).hasWorkPhotos = true;
                            }
                        }
                        const certs = certificationsByProviderId.get(provId);
                        if (Array.isArray(certs) && certs.length > 0) {
                            (p as any).certifications = certs;
                        }
                    }
                });
                logStage(
                    `prefetch cache/providers done (candidatePlaces=${placeIds.length})`,
                    'prefetch_cache_providers_done'
                );
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
        logStage(`fast providers prepared (count=${fastProviders.length})`, 'fast_providers_prepared');

        // Rank by weighted composite: relevance 40%, Bayesian rating 30%, proximity 20%, recency 10%.
        // Result count scales with radius so wider searches can surface meaningfully more providers.
        const rankedProviders = rankProviders(fastProviders as ProviderItem[], providerLimit, {
            tradeDetail: tradeDetailRaw,
            trade: tradeNorm,
        });
        const limitedProviders = rankedProviders.map((p) => ({ ...p }));
        logStage(`providers ranked (count=${limitedProviders.length})`, 'providers_ranked');

        // Attach internal provider IDs as early as possible so the UI can route to /pro/[id]
        // even when quick mode skips slower DB augment steps.
        if (prefetchedProvRows && prefetchedProvRows.length > 0) {
            const providerIdByGoogle = new Map<string, string>(
                prefetchedProvRows.map((r) => [String(r.google_place_id), String(r.id)])
            );
            limitedProviders.forEach((p: any) => {
                const rawPid = p?.placeId || p?.place_id;
                if (typeof rawPid !== 'string') return;
                const googlePlaceId = toGooglePlaceId(rawPid);
                const providerId = providerIdByGoogle.get(googlePlaceId);
                if (providerId) p.providerId = providerId;
            });
        }

        // AI summaries from real review text: use Supabase reviews when we have them; otherwise
        // Place Details (same request). This must run even when providers are not in Supabase yet
        // (previously we bailed out and left the template "Customers typically…" summary).
        if (!quickMode && limitedProviders.length > 0) {
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

                    // 2.1: Parallelise Mendr review count + rotation tokens fetch — both need
                    // providerIds but are independent of each other.
                    const [mendrData, tokenRows] = await Promise.all([
                        providerIdList.length > 0
                            ? dbReader
                                .from('reviews')
                                .select('provider_id')
                                .eq('source', 'mendr')
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

                    // Attach Mendr review counts
                    const mendrReviewCountByProviderId = new Map<string, number>();
                    if (Array.isArray(mendrData)) {
                        for (const r of mendrData) {
                            const pid = typeof (r as any)?.provider_id === 'string' ? (r as any).provider_id : null;
                            if (!pid) continue;
                            mendrReviewCountByProviderId.set(
                                pid,
                                (mendrReviewCountByProviderId.get(pid) ?? 0) + 1
                            );
                        }
                    }
                    // Attach to every provider in the response so the frontend can show:
                    // (Google total reviews) + (all Mendr reviews stored in backend).
                    (limitedProviders as any[]).forEach((p: any) => {
                        const pid = typeof p?.providerId === 'string' ? p.providerId : null;
                        p.mendrReviewCount = pid ? mendrReviewCountByProviderId.get(pid) ?? 0 : 0;
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

        // Best-effort: persist returned providers + reviews. Fire-and-forget.
        if (!pageToken && limitedProviders.length > 0) {
            scheduleProvidersBackgroundSync({
                limitedProviders,
                places,
                apiKey,
            });
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
                quickMode,
            },
        });

        const responseBody: ProvidersResponseBody = {
            providers: limitedProviders,
            nextPageToken: data.nextPageToken || null,
            searchQuery,
            tradeDetail: tradeDetailRaw || null,
        };
        console.warn(
            JSON.stringify({ type: 'providers_response', durationMs: Date.now() - t0, count: limitedProviders.length })
        );
        return NextResponse.json(attachDebugTiming(responseBody));
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
