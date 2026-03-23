import { NextRequest, NextResponse } from 'next/server';
import { logAiEvent } from '@/lib/ai-logging';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { summarizeReviews, sanitizeCustomerSummary } from '@/lib/review-summary';
import { formatWeekdayDescriptionsTo24h } from '@/lib/format-weekday-descriptions';
import { isOpenNowFromWeekdayDescriptions } from '@/lib/open-status';
import { buildProviderQuery } from './query-builder';
import { rankProviders } from './ranking';
import type { ProviderItem, ProvidersRequestBody, ProvidersResponseBody } from './contracts';
import { buildSearchCacheKey } from './cache';
import { withTimeout } from './review-enrichment';
import { toGooglePlaceId } from './persistence';

export async function POST(req: NextRequest) {
    try {
        const startedAt = Date.now();
        let searchCacheHit = false;
        let searchCacheExpired = false;
        const body = (await req.json()) as ProvidersRequestBody;
        const {
            lat,
            lng,
            trade,
            radius: customRadius,
            pageToken,
            searchQuery: providedSearchQuery,
            /** Optional specialty line from AI diagnosis (same as `conversations.diagnosis.trade_detail`). Refines Google text search. */
            tradeDetail,
        } = body;
        let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
        try {
            supabase = await createSupabaseServerClient();
        } catch (e) {
            console.warn(
                'Supabase not configured — provider cache disabled:',
                (e as Error).message
            );
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

        const radius = customRadius || 50000; // Default 50km — wider search for rural/sparse areas

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

        // Basic safety net: hard block obviously irrelevant categories (weed dispensaries, restaurants, etc.)
        const BANNED_TYPES = new Set<string>([
            'cannabis_store',
            'marijuana_dispensary',
            'liquor_store',
            'bar',
            'restaurant',
            'cafe',
            'coffee_shop',
            'night_club',
            'spa',
            'hair_salon',
            'beauty_salon',
            'nail_salon',
            'clothing_store',
            'shoe_store',
            'supermarket',
            'grocery_or_supermarket',
        ]);
        const BANNED_KEYWORDS = [
            'cannabis',
            'marijuana',
            'weed',
            'dispensary',
            'vape',
            'coffee',
            'restaurant',
            'bar ',
            ' bar',
            'cocktail',
            'nail bar',
            'hair salon',
            'beauty',
        ];

        // Home-service related keywords – anything that *doesn't* contain one of these is suspicious
        const SERVICE_KEYWORDS = [
            'electric',
            'plumb',
            'geyser',
            'drain',
            'sewer',
            'gate',
            'garage door',
            'roof',
            'gutter',
            'tile',
            'floor',
            'flooring',
            'paint',
            'pool',
            'locksmith',
            'waste',
            'rubble',
            'removal',
            'weld',
            'carpentry',
            'woodwork',
            'builder',
            'construction',
            'contractor',
            'handyman',
            'borehole',
            'well',
            'drill',
            'pump',
        ];

        function isProviderRelevantForTrade(params: {
            place: any;
            aiData: any;
            cached: any;
        }): boolean {
            const { place, aiData, cached } = params;
            const typesRaw: string[] = (place.types || []).map((t: string) =>
                (t || '').toString().toLowerCase()
            );
            // Google types are typically underscore-separated (`garage_door_supplier`), but our
            // keyword checks use spaces (`garage door`). Include both forms in the text haystack.
            const typesText: string[] = typesRaw.map((t) => t.replace(/_/g, ' '));

            // Hard block banned Google types (e.g. cannabis stores, restaurants)
            if (typesRaw.some((t) => BANNED_TYPES.has(t))) return false;

            const servicesFromAi = Array.isArray(aiData?.services)
                ? (aiData.services as { short?: string; full?: string }[])
                : [];
            const servicesFromCache = Array.isArray(cached?.services)
                ? (cached.services as { short?: string; full?: string }[])
                : [];
            const servicesText = [...servicesFromAi, ...servicesFromCache]
                .flatMap((s) => [s.short, s.full])
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            const name = (aiData?.name || place.displayName?.text || cached?.name || '')
                .toString()
                .toLowerCase();

            const haystack = [
                name,
                servicesText,
                ...typesRaw,
                ...typesText,
                (place.formattedAddress || '').toString().toLowerCase(),
            ]
                .join(' ')
                .replace(/_/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            // Hard block on banned textual keywords (weed shops, etc.)
            if (BANNED_KEYWORDS.some((kw) => haystack.includes(kw))) {
                return false;
            }

            // Require at least one home-service style keyword somewhere in the data
            const hasServiceKeyword = SERVICE_KEYWORDS.some((kw) => haystack.includes(kw));
            if (!hasServiceKeyword) return false;

            // Light trade-specific check: when we know the trade, prefer matching text
            if (tradeNorm) {
                const t = tradeNorm;
                if (t.includes('plumb')) {
                    const specialtyNeedsWaterWell = isBoreholeLikeDetail;
                    if (specialtyNeedsWaterWell) {
                        const ok =
                            haystack.includes('borehole') ||
                            haystack.includes('well drill') ||
                            haystack.includes('well-drill') ||
                            (haystack.includes('well') && haystack.includes('drill')) ||
                            haystack.includes('drill') ||
                            haystack.includes('pump') ||
                            haystack.includes('water well');
                        if (!ok) return false;
                    } else if (!haystack.includes('plumb') && !haystack.includes('geyser')) {
                        return false;
                    }
                }
                if (t.includes('electric') && !haystack.includes('electric')) {
                    return false;
                }
                if (t.includes('locksmith') && !haystack.includes('lock')) {
                    return false;
                }
                if ((t.includes('pool') || t.includes('swim')) && !haystack.includes('pool')) {
                    return false;
                }
                if ((t.includes('paint') || t.includes('painting')) && !haystack.includes('paint')) {
                    return false;
                }

                // If the user picked "Security & Access", do not surface generic security providers
                // (alarm/CCTV/guards) unless the place is clearly about gates/garage doors.
                if (t === 'security & access' || t.includes('security')) {
                    const hasSecuritySignalInTypes = typesRaw.some((gt) => {
                        const s = String(gt || '');
                        return (
                            s.includes('security') ||
                            s.includes('alarm') ||
                            s.includes('surveillance') ||
                            s.includes('guard')
                        );
                    });

                    const hasGateOrGarageSignalInTypes = typesRaw.some((gt) => {
                        const s = String(gt || '');
                        return s.includes('gate') || s.includes('garage_door');
                    });

                    // If it's a security-type place but no gate/garage types are present, reject.
                    if (hasSecuritySignalInTypes && !hasGateOrGarageSignalInTypes) {
                        return false;
                    }
                }
            }

            return true;
        }

        const normalizePlaceId = (id: string) => (id || '').replace(/^places\//, '');

        const TWENTY_FOUR_MONTHS_MS = 24 * 30 * 24 * 60 * 60 * 1000; // approximate rolling window

        function normalizeProviderName(name: string): string {
            let s = (name || '').toString().trim();
            if (!s) return s;

            const originalLower = s.toLowerCase();
            // Explicit overrides for known messy / incorrect names.
            const OVERRIDES: Record<string, string> = {
                'al garage door solutions - new | repairs | automations':
                    'AL Garage Door Solutions',
                'planet automation (pty)': 'Planet Automation',
                'automationguru gate and garage door motor repair':
                    'AutomationGURU Gate and Garage Repairs',
                'brano cape garage doors - cape town': 'Brunco Cape Garage Doors',
                'garage door repairs cbd - maintenance & motor automation installation services cape town':
                    'Garage Door Repairs CBD',
            };
            if (OVERRIDES[originalLower]) {
                return OVERRIDES[originalLower];
            }

            // Remove common legal suffixes (keep the brand name for display).
            // Examples: "Acme (Pty) Ltd", "Acme Pty Ltd.", "Acme CC"
            s = s
                .replace(/\b(\(pty\)\s*ltd|pty\s*ltd|limited|ltd|inc|llc|cc)\b\.?/gi, '')
                .replace(/\s*\((pty|cc|inc|ltd)\)\s*$/gi, '')
                .replace(/\s{2,}/g, ' ')
                .replace(/\s*,\s*$/g, '')
                .trim();

            // Drop long marketing tails after a hyphen, keeping the core brand.
            // e.g. "X - New | Repairs | Automations" -> "X"
            s = s.replace(/\s*-\s+.+$/, '').trim();

            // Clean leftover punctuation / spacing around parentheses.
            s = s.replace(/\s+\)/g, ')').replace(/\(\s+/g, '(').trim();
            // Enforce Title Case for consistent provider naming across API + Supabase.
            // We preserve "mixed case" brand tokens (e.g. "McDonald", "DeWalt") if Google already
            // returned them with internal capitals.
            const titleCaseWord = (word: string) => {
                const raw = word.trim();
                if (!raw) return raw;

                // Keep acronyms/digit tokens as-is (e.g. "G4S", "BRANCO").
                if (/^[A-Z0-9]{2,}$/.test(raw)) return raw;

                // Preserve "mixed case" tokens when they already include meaningful internal capitals.
                if (/[A-Z]/.test(raw.slice(1)) && /[a-z]/.test(raw)) {
                    return raw[0].toUpperCase() + raw.slice(1);
                }

                const lower = raw.toLowerCase();
                // Handle common "Mc"/"Mac" brands when the whole token is lowercased.
                if (lower.startsWith('mc') && lower.length > 2) {
                    const tail = lower.slice(2);
                    return 'Mc' + tail[0].toUpperCase() + tail.slice(1);
                }
                if (lower.startsWith('mac') && lower.length > 3) {
                    const tail = lower.slice(3);
                    return 'Mac' + tail[0].toUpperCase() + tail.slice(1);
                }

                return lower[0].toUpperCase() + lower.slice(1);
            };

            const titleCaseToken = (token: string) => {
                // Preserve separators like "-", "/", and "'" while titlecasing each part.
                const parts = token.split(/([-\/])/); // keep delimiters
                return parts
                    .map((part) => {
                        if (part === '-' || part === '/' || part === '') return part;
                        const apostropheParts = part.split(/(')/); // keep delimiter
                        return apostropheParts
                            .map((ap) => {
                                if (ap === "'") return ap;
                                return titleCaseWord(ap);
                            })
                            .join('');
                    })
                    .join('');
            };

            s = s
                .split(/\s+/g)
                .map((w) => titleCaseToken(w))
                .filter(Boolean)
                .join(' ');

            return s;
        }

        const GENERIC_PLACE_TYPES = new Set([
            'point_of_interest',
            'establishment',
            'place',
            'store',
            'local_business',
            'place_of_worship',
            'food',
        ]);
        const TYPE_TO_LABEL: Record<string, string> = {
            plumber: 'Plumber',
            plumbing_contractor: 'Plumbing',
            electrician: 'Electrician',
            electrical_contractor: 'Electrical',
            general_contractor: 'General Contractor',
            roofing_contractor: 'Roofing',
            painter: 'Painter',
            moving_company: 'Moving',
            locksmith: 'Locksmith',
            handyman: 'Handyman',
            carpenter: 'Carpenter',
            real_estate_agency: 'Real Estate',
            hvac_contractor: 'HVAC',
            swimming_pool_contractor: 'Pool Service',
            pest_control: 'Pest Control',
            landscaping: 'Landscaping',
            garage_door_repair: 'Garage Door',
            appliance_repair: 'Appliance Repair',
            flooring_store: 'Flooring',
            tile_store: 'Tiling',
            roofing: 'Roofing',
            painter_decorator: 'Painting',
            waste_management: 'Waste Removal',
            rubbish_dump: 'Waste Removal',
        };
        function getPlaceServices(types: string[] | undefined): { short: string; full: string }[] {
            if (!Array.isArray(types) || types.length === 0) return [];
            const seen = new Set<string>();
            return types
                .filter((t) => t && !GENERIC_PLACE_TYPES.has(t))
                .map((t: string) => {
                    const key = t.toLowerCase().replace(/\s+/g, '_');
                    const label = TYPE_TO_LABEL[key] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                    return { short: label, full: label };
                })
                .filter((s) => {
                    if (seen.has(s.short)) return false;
                    seen.add(s.short);
                    return true;
                });
        }

        async function fetchPlaceReviewsFromGoogle(placeResourceName: string): Promise<any[]> {
            if (!apiKey) return [];
            const placeName = (placeResourceName || '').trim();
            if (!placeName) return [];
            const fullName = placeName.startsWith('places/') ? placeName : `places/${placeName}`;
            const url = `https://places.googleapis.com/v1/${fullName}`;
            try {
                const ctrl = new AbortController();
                const timeout = setTimeout(() => ctrl.abort(), 5000);
                const res = await fetch(url, {
                    method: 'GET',
                    signal: ctrl.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask':
                            'id,reviews,reviews.name,reviews.rating,reviews.publishTime,reviews.relativePublishTimeDescription,reviews.originalText,reviews.text,reviews.authorAttribution',
                    },
                });
                clearTimeout(timeout);
                if (!res.ok) return [];
                const place = await res.json().catch(() => null);
                const reviews = place?.reviews;
                return Array.isArray(reviews) ? reviews : [];
            } catch {
                return [];
            }
        }

        const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

        // Search cache: (lat, lng, trade, radius) -> place_ids + routing (+ optional full providers JSON for fast hits).
        let places: any[] = [];
        let routingSummaries: any[] = [];
        let data: { nextPageToken?: string | null; places?: any[]; routingSummaries?: any[] } = {
            nextPageToken: null,
        };
        let cachedData: any[] = [];
        let pendingCacheWrite: { key: string; placeIds: string[]; routing: any[]; nextToken: string | null } | null = null;

        if (!pageToken && supabase) {
            const latR = Math.round(Number(lat) * 1000) / 1000;
            const lngR = Math.round(Number(lng) * 1000) / 1000;
            const searchCacheKey = buildSearchCacheKey({
                lat: Number(lat),
                lng: Number(lng),
                tradeNorm,
                detailKeyForCache,
                radius: Number(radius),
            });
            const { data: searchRow } = await supabase
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
                    const cacheHasRichFields =
                        !!(
                            cachedProviders &&
                            Array.isArray(cachedProviders) &&
                            cachedProviders.length > 0 &&
                            cachedProviders.some((p) => {
                                if (!p || typeof p !== 'object') return false;
                                const summaryOk =
                                    typeof (p as any).summary === 'string' &&
                                    (p as any).summary.trim().length > 0;
                                const summaryKindOk = (p as any)?.summaryMeta?.kind === 'reviews';
                                // The chat UI expects a review-based summary. If it's missing or not review-based, refresh.
                                return summaryOk && summaryKindOk;
                            })
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
                        // Enforce minimum review count on cached providers as well.
                        const filteredCached = normalizedCached.filter((p: any) => {
                            const count = p?.ratingCount ?? p?.rating_count ?? 0;
                            return typeof count === 'number' && count >= 5;
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
                            logAiEvent({
                                endpoint: 'providers',
                                status: 'ok',
                                durationMs,
                                meta: {
                                    trade,
                                    providersCount: cachedProviders.length,
                                    searchCacheHit: true,
                                    usedCacheProvidersJson: true,
                                },
                            });
                            return NextResponse.json({
                                providers: providersWithIds,
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
            const RETAIL_TYPES = new Set([
                'hardware_store',
                'home_goods_store',
                'home_improvement_store',
                'building_materials_store',
                'department_store',
                'warehouse_store',
                'discount_store',
            ]);
            const filtered: { place: any; routing: any }[] = [];
            rawPlaces.forEach((p: any, i: number) => {
                const types = (p.types || []) as string[];
                const hasRetailType = types.some((t: string) => RETAIL_TYPES.has(t));
                if (!hasRetailType) filtered.push({ place: p, routing: rawRouting[i] });
            });
            places = filtered.map((f) => f.place);
            routingSummaries = filtered.map((f) => f.routing);

            if (supabase && !pageToken && places.length > 0) {
                const latR = Math.round(Number(lat) * 1000) / 1000;
                const lngR = Math.round(Number(lng) * 1000) / 1000;
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

        // 3. Fast-path mapping for MVP: skip enrichment and heavy caching.
        const fastProviders = places
            .map((place: any, index: number) => {
                if (!isProviderRelevantForTrade({ place, aiData: null, cached: null })) {
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

                // Hard rule: never surface providers with fewer than 5 reviews.
                if (ratingCount < 5) {
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

        // Sort by composite score: balance rating, review count, and distance (closer + higher rated first).
        const distanceKmNum = (p: { distanceKm: number | null }) => (p.distanceKm != null ? p.distanceKm : 999);
        const top25 = rankProviders(fastProviders as ProviderItem[], 25);
        const limitedProviders = top25.map((p) => ({ ...p }));

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
                let byProvider = new Map<string, Array<{ rating: number | null; body: string }>>();

                if (supabase) {
                    const { data: provRows } = await supabase
                        .from('providers')
                        .select('id, google_place_id')
                        .in('google_place_id', googleIds);
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
                    const scandioReviewCountByProviderId = new Map<string, number>();
                    if (providerIds.length > 0) {
                        // For /match review counts: we need total Scandio reviews stored in backend.
                        const providerIdList = providerIds.map((x) => String(x));
                        try {
                            const { data: scandioRows } = await supabase
                                .from('reviews')
                                .select('provider_id')
                                .eq('source', 'scandio')
                                .eq('status', 'approved')
                                .in('provider_id', providerIdList);

                            if (Array.isArray(scandioRows)) {
                                for (const r of scandioRows) {
                                    const pid = typeof (r as any)?.provider_id === 'string' ? (r as any).provider_id : null;
                                    if (!pid) continue;
                                    scandioReviewCountByProviderId.set(
                                        pid,
                                        (scandioReviewCountByProviderId.get(pid) ?? 0) + 1
                                    );
                                }
                            }
                        } catch {
                            // Best-effort only; keep counts at 0 on failure.
                        }

                        // Attach to every provider in the response so the frontend can show:
                        // (Google total reviews) + (all Scandio reviews stored in backend).
                        limitedProviders.forEach((p: any) => {
                            const pid = typeof p?.providerId === 'string' ? p.providerId : null;
                            p.scandioReviewCount =
                                pid ? scandioReviewCountByProviderId.get(pid) ?? 0 : 0;
                        });
                    } else {
                        limitedProviders.forEach((p: any) => {
                            p.scandioReviewCount = 0;
                        });
                    }
                    if (providerIds.length > 0) {
                        const cutoff = new Date(Date.now() - TWENTY_FOUR_MONTHS_MS).toISOString();
                        // Fetch up to 50 recent google reviews per provider_id.
                        // We do this per-provider (with a small concurrency cap) so we don't
                        // end up with reviews only for the "newest" providers when using a
                        // single global LIMIT across all provider_ids.
                        byProvider = new Map();
                        const providerIdCursor = { v: 0 };
                        const concurrency = 4;
                        const providerIdList = providerIds.map((x) => String(x));

                        const reviewWorker = async () => {
                            while (providerIdCursor.v < providerIdList.length) {
                                const pid = providerIdList[providerIdCursor.v];
                                providerIdCursor.v += 1;

                                try {
                                    const { data: reviewRows } = await supabase
                                        .from('reviews')
                                        .select('provider_id, rating, body, published_at')
                                        .eq('source', 'google')
                                        .eq('provider_id', pid)
                                        .gte('published_at', cutoff)
                                        .order('published_at', { ascending: false })
                                        .limit(50);

                                    const arr = (reviewRows || []).map((r: any) => ({
                                        rating: typeof r.rating === 'number' ? r.rating : null,
                                        body: String(r.body || ''),
                                    }));
                                    byProvider.set(pid, arr);
                                } catch {
                                    // Leave missing/empty provider review buckets.
                                }
                            }
                        };

                        await Promise.allSettled(
                            Array.from({ length: concurrency }, () => reviewWorker())
                        );
                    }
                }

                const mapGoogleReviewsToInput = (googleReviews: any[]) =>
                    (googleReviews || [])
                        .map((r: any) => {
                            const rawBody =
                                (typeof r?.originalText?.text === 'string' && r.originalText.text) ||
                                (typeof r?.text?.text === 'string' && r.text.text) ||
                                (typeof r?.text === 'string' && r.text) ||
                                '';
                            const body = String(rawBody || '').trim();
                            if (!body) return null;
                            return {
                                rating: typeof r?.rating === 'number' ? r.rating : null,
                                text: { text: body },
                            };
                        })
                        .filter(Boolean) as Array<{ rating: number | null; text: { text: string } }>;

                // Bound expensive AI work so the endpoint remains responsive.
                // Previously we tried to summarise all `limitedProviders`, but in practice
                // per-provider timeouts meant only the first couple ended up with summaries.
                // Summarise the top chunk only so more providers actually get populated.
                const providersToSummarize = limitedProviders.slice(0, 6) as any[];
                // Gemini calls can be rate-limited; keep concurrency low so more than
                // the first few providers succeed.
                const concurrency = 2;
                let cursor = 0;
                let summaryAttempted = 0;
                let summarySucceeded = 0;

                const worker = async () => {
                    while (cursor < providersToSummarize.length) {
                        const currentIndex = cursor;
                        cursor += 1;
                        const p = providersToSummarize[currentIndex];
                        if (!p) continue;

                        try {
                            const googlePlaceId =
                                typeof p.placeId === 'string' && p.placeId.startsWith('places/')
                                    ? p.placeId
                                    : `places/${p.placeId}`;
                            const pid = providerIdByGoogle.get(googlePlaceId);
                            const rows = pid ? byProvider.get(pid) || [] : [];

                            let summaryInputReviews: Array<{ rating: number | null; text: { text: string } }> = rows.map(
                                (r) => ({
                                    rating: r.rating,
                                    text: { text: r.body },
                                })
                            );

                            if (summaryInputReviews.length === 0) {
                                const googleReviews = await fetchPlaceReviewsFromGoogle(googlePlaceId);
                                summaryInputReviews = mapGoogleReviewsToInput(googleReviews);
                            }

                            if (summaryInputReviews.length === 0) continue;

                            summaryAttempted += 1;
                            const reviewSummary = await withTimeout(
                                summarizeReviews({
                                    providerName: normalizeProviderName(p.name || ''),
                                    rating: p.rating ?? null,
                                    ratingCount: p.ratingCount ?? 0,
                                    reviews: summaryInputReviews,
                                }),
                                12000
                            );

                            if (reviewSummary?.summary?.trim()) {
                                p.summary = sanitizeCustomerSummary(reviewSummary.summary.trim());
                                p.summaryMeta = reviewSummary.meta;
                                summarySucceeded += 1;
                            }
                        } catch {
                            // Continue summarising other providers.
                        }
                    }
                };

                await Promise.allSettled(
                    Array.from({ length: concurrency }, () => worker())
                );

                // Helpful diagnostics in response (UI ignores unknown fields).
                logAiEvent({
                    endpoint: 'providers',
                    status: 'ok',
                    durationMs: Date.now() - startedAt,
                    meta: {
                        trade,
                        summaryAttempted,
                        summarySucceeded,
                        limitedProvidersCount: limitedProviders.length,
                        concurrency,
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
                        const googlePlaceId =
                            typeof p.placeId === 'string' && p.placeId.startsWith('places/')
                                ? p.placeId
                                : `places/${p.placeId}`;
                        const openingHours = (p as any).weekdayDescriptions;
                        const hoursArray = formatWeekdayDescriptionsTo24h(openingHours) ?? [];

                        return {
                            source: 'google',
                            google_place_id: googlePlaceId,
                            name: normalizeProviderName(p.name),
                            address: p.address,
                            rating: p.rating,
                            rating_count: p.ratingCount ?? 0,
                            phone: p.phone,
                            website: p.website,
                            latitude: p.latitude,
                            longitude: p.longitude,
                            summary: p.summary ?? '',
                            services: p.services ?? [],
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
                    const googleIds = rows.map((r) => r.google_place_id).filter(Boolean);
                    const { data: providerRows, error: provErr } = await adminSupabase
                        .from('providers')
                        .select('id, google_place_id')
                        .in('google_place_id', googleIds);
                    if (provErr) {
                        console.warn('Reviews upsert skipped:', provErr.message);
                        return upsertRes;
                    }
                    const providerIdByGoogle = new Map<string, string>(
                        (providerRows || []).map((r: any) => [String(r.google_place_id), String(r.id)])
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

                    const reviewPayload: any[] = [];
                    const cutoffMs = Date.now() - TWENTY_FOUR_MONTHS_MS;

                    for (const googlePlaceId of googleIds) {
                        const providerId = providerIdByGoogle.get(googlePlaceId);
                        if (!providerId) continue;
                        const pl = placeById.get(normalizePlaceId(googlePlaceId));
                        let revs = (pl?.reviews || []) as any[];
                        if (!Array.isArray(revs) || revs.length === 0) {
                            // Fallback: Places search results can omit review bodies for some rows.
                            // Pull place details directly so review sync still happens.
                            revs = await fetchPlaceReviewsFromGoogle(googlePlaceId);
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
                                onConflict: 'source,source_ref',
                            });
                        if (reviewsErr) {
                            console.warn('Reviews upsert skipped:', reviewsErr.message);
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
