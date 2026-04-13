/**
 * POST /api/enrich/get
 *
 * Returns cached enrichment data for a list of Google Place IDs.
 * Body: { placeIds: string[] }
 * Response: { cache: Record<googlePlaceId, EnrichmentCacheEntry> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { expandPlaceIdsForDbQuery, toGooglePlaceId } from '@/app/api/providers/persistence';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { aiConfig } from '@/lib/ai-config';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Match page only needs summary + timestamps for place-id keys. Older Supabase DBs omit columns the
 * full enrichment pipeline uses (`has_work_photos`, `response_profile`, …) — selecting them makes
 * Postgrest return zero rows.
 */
const PROVIDER_CACHE_SELECT_MATCH =
    'provider_id, google_place_id, review_summary, enriched_at, cache_version, scrape_status';

export interface EnrichmentCacheEntry {
    googlePlaceId: string;
    bio: string | null;
    specialisations: string[];
    hasWorkPhotos: boolean;
    reviewSummary: string | null;
    /** True when fast path deliberately skipped AI (not enough DB reviews); do not keep polling. */
    fastSummaryInsufficient?: boolean;
    responseProfile: string | null;
    websiteQuality: string | null;
    enrichedAt: string | null;
    profileCompleteness: number;
    cacheVersion: number;
}

/** Server-side memo for identical GET bodies; longer TTL makes repeat match navigations feel instant. */
const ENRICH_GET_CACHE_TTL_MS = 60_000;
/** Browser may reuse responses for a short window (same-origin fetch). */
const ENRICH_GET_CACHE_CONTROL = 'private, max-age=20, stale-while-revalidate=120';
type CachedGetResult = {
    cache: Record<string, EnrichmentCacheEntry>;
    currentCacheVersion: number;
};
const enrichGetResponseCache = new Map<string, { expiresAt: number; value: CachedGetResult }>();
const enrichGetInflight = new Map<string, Promise<CachedGetResult>>();

function cacheKeyForPlaceIds(placeIds: string[]): string {
    return placeIds.slice().sort().join(',');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = checkRateLimit(req, 'enrichGet');
    if (limited) return limited;

    try {
        const t0 = Date.now();
        const stageTimings: Record<string, number> = {};
        const logStage = (label: string, key?: string) => {
            if (process.env.NODE_ENV === 'development') {
                const elapsed = Date.now() - t0;
                if (key) stageTimings[key] = elapsed;
                console.log(`[enrich/get] ${label} at +${elapsed}ms`);
            }
        };
        const body = await req.json().catch(() => null) as {
            placeIds?: unknown;
            providerIds?: unknown;
        } | null;

        if (!body || !Array.isArray(body.placeIds) || body.placeIds.length === 0) {
            return NextResponse.json({ cache: {} });
        }

        const placeIds = (body.placeIds as string[])
            .filter((id) => typeof id === 'string' && id.trim())
            .map((id) => toGooglePlaceId(id.trim()))
            .slice(0, 30);
        const placeIdsForQuery = expandPlaceIdsForDbQuery(placeIds);
        const rawProviderIds = Array.isArray(body.providerIds) ? (body.providerIds as unknown[]) : [];
        /** Same length as placeIds when client sends aligned UUIDs (empty string = none). */
        const providerIdsAligned =
            rawProviderIds.length === placeIds.length
                ? placeIds.map((_, i) => {
                      const v = rawProviderIds[i];
                      return typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim() : '';
                  })
                : [];
        const providerIdsForQuery = [...new Set(providerIdsAligned.filter(Boolean))];
        logStage(
            `place ids (count=${placeIds.length}, queryVariants=${placeIdsForQuery.length}, providerUuids=${providerIdsForQuery.length})`,
            'place_ids_normalized'
        );
        const requestKey = cacheKeyForPlaceIds([...placeIds, ...providerIdsForQuery.sort()]);
        const now = Date.now();

        const cached = enrichGetResponseCache.get(requestKey);
        if (cached && now < cached.expiresAt) {
            logStage('served from memory cache', 'memory_cache_hit');
            return NextResponse.json(
                {
                    ...cached.value,
                    ...(process.env.NODE_ENV === 'development'
                        ? {
                            debugTiming: {
                                totalMs: Date.now() - t0,
                                stages: stageTimings,
                                source: 'memory_cache',
                            },
                        }
                        : {}),
                },
                { headers: { 'Cache-Control': ENRICH_GET_CACHE_CONTROL } }
            );
        }
        if (cached) enrichGetResponseCache.delete(requestKey);

        const inflight = enrichGetInflight.get(requestKey);
        if (inflight) {
            const shared = await inflight;
            logStage('joined in-flight request', 'inflight_join');
            return NextResponse.json(
                {
                    ...shared,
                    ...(process.env.NODE_ENV === 'development'
                        ? {
                            debugTiming: {
                                totalMs: Date.now() - t0,
                                stages: stageTimings,
                                source: 'inflight',
                            },
                        }
                        : {}),
                },
                { headers: { 'Cache-Control': ENRICH_GET_CACHE_CONTROL } }
            );
        }

        const loadPromise = (async (): Promise<CachedGetResult> => {
            const admin = await createSupabaseAdminClient();
            logStage('admin client ready', 'admin_client_ready');

            /** Resolve internal provider UUIDs + canonical place ids from requested places (no client UUIDs required). */
            const providerGidById = new Map<string, string>();
            const derivedProviderIds: string[] = [];
            let rowsByPlace: unknown[] = [];
            let errPlace: { message: string } | null = null;
            let rowsByProvider: unknown[] = [];
            let errProv: { message: string } | null = null;

            if (placeIdsForQuery.length > 0) {
                const cacheClientPromise =
                    providerIdsForQuery.length > 0
                        ? admin
                              .from('provider_cache')
                              .select(PROVIDER_CACHE_SELECT_MATCH)
                              .in('provider_id', providerIdsForQuery)
                        : Promise.resolve({
                              data: [] as unknown[],
                              error: null as { message: string } | null,
                          });

                const [provRes, cacheByPlaceRes, cacheByClientRes] = await Promise.all([
                    admin
                        .from('providers')
                        .select('id, google_place_id')
                        .eq('is_active', true)
                        .in('google_place_id', placeIdsForQuery),
                    admin
                        .from('provider_cache')
                        .select(PROVIDER_CACHE_SELECT_MATCH)
                        .in('google_place_id', placeIdsForQuery),
                    cacheClientPromise,
                ]);
                for (const r of provRes.data ?? []) {
                    const id = String((r as { id?: string }).id ?? '');
                    const gid = String((r as { google_place_id?: string }).google_place_id ?? '').trim();
                    if (id) derivedProviderIds.push(id);
                    if (id && gid) providerGidById.set(id, toGooglePlaceId(gid));
                }
                rowsByPlace = (cacheByPlaceRes.data ?? []) as unknown[];
                errPlace = cacheByPlaceRes.error;

                const rowsByClient = (cacheByClientRes.data ?? []) as unknown[];
                if (cacheByClientRes.error) errProv = cacheByClientRes.error;

                const clientUuidSet = new Set(providerIdsForQuery);
                const derivedOnly = derivedProviderIds.filter((id) => id && !clientUuidSet.has(id));

                let rowsByDerived: typeof rowsByPlace = [];
                if (derivedOnly.length > 0) {
                    const { data: rp, error: ep } = await admin
                        .from('provider_cache')
                        .select(PROVIDER_CACHE_SELECT_MATCH)
                        .in('provider_id', derivedOnly);
                    rowsByDerived = rp ?? [];
                    if (ep) errProv = ep ?? errProv;
                }

                // Do not filter by scrape_status: fast path writes `ok`, full enrichment may write
                // `failed`/`skip` while still persisting review_summary or enriched_at (marker).
                rowsByProvider = [...rowsByClient, ...rowsByDerived];
            } else if (providerIdsForQuery.length > 0) {
                const { data: rp, error: ep } = await admin
                    .from('provider_cache')
                    .select(PROVIDER_CACHE_SELECT_MATCH)
                    .in('provider_id', providerIdsForQuery);
                rowsByProvider = rp ?? [];
                errProv = ep;
            }

            const providerIdsForCacheQuery = [
                ...new Set([...providerIdsForQuery, ...derivedProviderIds]),
            ];

            let unfilteredCount = 0;
            let unfilteredStatuses: string[] = [];
            if (
                (rowsByPlace?.length ?? 0) === 0 &&
                rowsByProvider.length === 0 &&
                providerIdsForCacheQuery.length > 0
            ) {
                const { data: rawRows } = await admin
                    .from('provider_cache')
                    .select('provider_id, scrape_status')
                    .in('provider_id', providerIdsForCacheQuery)
                    .limit(24);
                unfilteredCount = rawRows?.length ?? 0;
                unfilteredStatuses = (rawRows ?? []).map(
                    (r) => String((r as { scrape_status?: string }).scrape_status ?? '?')
                );
            }

            const seenPid = new Set<string>();
            const rows: unknown[] = [];
            for (const r of rowsByPlace ?? []) {
                const pid = String((r as { provider_id?: string }).provider_id ?? '');
                if (pid && seenPid.has(pid)) continue;
                if (pid) seenPid.add(pid);
                rows.push(r);
            }
            for (const r of rowsByProvider) {
                const pid = String((r as { provider_id?: string }).provider_id ?? '');
                if (pid && seenPid.has(pid)) continue;
                if (pid) seenPid.add(pid);
                rows.push(r);
            }

            const rowsForCache = rows.filter((row: unknown) => {
                const rs = String(
                    (row as { review_summary?: string | null }).review_summary ?? ''
                ).trim();
                const ea = (row as { enriched_at?: string | null }).enriched_at;
                return rs.length > 0 || (ea != null && String(ea).trim().length > 0);
            });

            logStage(
                `provider_cache rows (byPlace=${rowsByPlace?.length ?? 0}, byProvider=${rowsByProvider.length}, merged=${rows.length}, usableForCards=${rowsForCache.length})`,
                'rows_loaded'
            );

            const cache: Record<string, EnrichmentCacheEntry> = {};
            for (const row of rowsForCache) {
                const rec = row as {
                    google_place_id?: string | null;
                    provider_id?: string;
                    review_summary?: string | null;
                    enriched_at?: string | null;
                    scrape_status?: string | null;
                    cache_version?: number;
                };
                const gidRaw = rec.google_place_id;
                const rpid = String(rec.provider_id ?? '');
                const gidTrim = String(gidRaw ?? '').trim();
                const gidFromProviders =
                    rpid && !gidTrim ? providerGidById.get(rpid) ?? '' : '';
                const effectiveGidForKeys =
                    gidTrim !== '' ? toGooglePlaceId(gidTrim) : gidFromProviders;
                let fallbackPlace = placeIds[0] ?? '';
                if (rpid && providerIdsAligned.length === placeIds.length) {
                    const idx = providerIdsAligned.findIndex((x) => x === rpid);
                    if (idx >= 0) fallbackPlace = placeIds[idx] ?? fallbackPlace;
                }
                const canonicalGid = effectiveGidForKeys || (gidTrim ? toGooglePlaceId(gidTrim) : '');
                const scrape = String(rec.scrape_status ?? '');
                const entry: EnrichmentCacheEntry = {
                    googlePlaceId: canonicalGid || toGooglePlaceId(fallbackPlace),
                    bio: null,
                    specialisations: [],
                    hasWorkPhotos: false,
                    reviewSummary: rec.review_summary ?? null,
                    fastSummaryInsufficient: scrape === 'fast_insufficient',
                    responseProfile: null,
                    websiteQuality: null,
                    enrichedAt: rec.enriched_at ?? null,
                    profileCompleteness: 0,
                    cacheVersion:
                        typeof rec.cache_version === 'number' && rec.cache_version > 0
                            ? Math.floor(rec.cache_version)
                            : 1,
                };
                const keys = new Set<string>();
                if (effectiveGidForKeys) {
                    for (const v of expandPlaceIdsForDbQuery([effectiveGidForKeys])) keys.add(v);
                }
                if (rpid && providerIdsAligned.length === placeIds.length) {
                    for (let i = 0; i < placeIds.length; i += 1) {
                        if (providerIdsAligned[i] === rpid) {
                            for (const v of expandPlaceIdsForDbQuery([placeIds[i] ?? ''])) keys.add(v);
                        }
                    }
                }
                for (const k of keys) {
                    if (k) cache[k] = entry;
                }
            }
            logStage(`cache entries built (keys=${Object.keys(cache).length})`, 'cache_built');

            return {
                cache,
                currentCacheVersion: aiConfig.providerEnrichmentCacheVersion,
            };
        })();
        enrichGetInflight.set(requestKey, loadPromise);
        let result: CachedGetResult;
        try {
            result = await loadPromise;
        } finally {
            enrichGetInflight.delete(requestKey);
        }
        // Do not cache empty results — background enrichment writes rows shortly after the first
        // empty read; caching `{}` for 4s caused polling to miss fresh `review_summary` values.
        if (Object.keys(result.cache).length > 0) {
            enrichGetResponseCache.set(requestKey, {
                value: result,
                expiresAt: Date.now() + ENRICH_GET_CACHE_TTL_MS,
            });
            logStage('response cached in memory', 'memory_cache_set');
        } else {
            logStage('skip memory cache (no rows yet)', 'memory_cache_skip_empty');
        }

        return NextResponse.json(
            {
                ...result,
                ...(process.env.NODE_ENV === 'development'
                    ? {
                        debugTiming: {
                            totalMs: Date.now() - t0,
                            stages: stageTimings,
                            source: 'database',
                        },
                    }
                    : {}),
            },
            { headers: { 'Cache-Control': ENRICH_GET_CACHE_CONTROL } }
        );
    } catch (err) {
        console.error('[enrich/get] Error:', err);
        return NextResponse.json({ cache: {} });
    }
}
