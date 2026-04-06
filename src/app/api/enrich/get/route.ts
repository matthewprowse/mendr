/**
 * POST /api/enrich/get
 *
 * Returns cached enrichment data for a list of Google Place IDs.
 * Body: { placeIds: string[] }
 * Response: { cache: Record<googlePlaceId, EnrichmentCacheEntry> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { toGooglePlaceId } from '@/app/api/providers/persistence';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { aiConfig } from '@/lib/ai-config';

export interface EnrichmentCacheEntry {
    googlePlaceId: string;
    bio: string | null;
    specialisations: string[];
    hasWorkPhotos: boolean;
    reviewSummary: string | null;
    responseProfile: string | null;
    websiteQuality: string | null;
    enrichedAt: string | null;
    profileCompleteness: number;
    cacheVersion: number;
}

const ENRICH_GET_CACHE_TTL_MS = 4_000;
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
        } | null;

        if (!body || !Array.isArray(body.placeIds) || body.placeIds.length === 0) {
            return NextResponse.json({ cache: {} });
        }

        const placeIds = (body.placeIds as string[])
            .filter((id) => typeof id === 'string' && id.trim())
            .map((id) => toGooglePlaceId(id.trim()))
            .slice(0, 30);
        logStage(`normalized place ids (count=${placeIds.length})`, 'place_ids_normalized');
        const requestKey = cacheKeyForPlaceIds(placeIds);
        const now = Date.now();

        const cached = enrichGetResponseCache.get(requestKey);
        if (cached && now < cached.expiresAt) {
            logStage('served from memory cache', 'memory_cache_hit');
            return NextResponse.json({
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
            });
        }
        if (cached) enrichGetResponseCache.delete(requestKey);

        const inflight = enrichGetInflight.get(requestKey);
        if (inflight) {
            const shared = await inflight;
            logStage('joined in-flight request', 'inflight_join');
            return NextResponse.json({
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
            });
        }

        const loadPromise = (async (): Promise<CachedGetResult> => {
            const admin = await createSupabaseAdminClient();
            logStage('admin client ready', 'admin_client_ready');

            const { data: rows } = await admin
                .from('provider_cache')
                .select(
                    'google_place_id, bio, specialisations, has_work_photos, review_summary, response_profile, website_quality, enriched_at, profile_completeness, cache_version'
                )
                .in('google_place_id', placeIds)
                .eq('scrape_status', 'ok');
            logStage(`provider_cache rows loaded (count=${rows?.length ?? 0})`, 'rows_loaded');

            const cache: Record<string, EnrichmentCacheEntry> = {};
            for (const row of rows ?? []) {
                const gid = row.google_place_id as string;
                if (!gid) continue;
                const entry: EnrichmentCacheEntry = {
                    googlePlaceId: gid,
                    bio: (row.bio as string | null) ?? null,
                    specialisations: Array.isArray(row.specialisations) ? (row.specialisations as string[]) : [],
                    hasWorkPhotos: Boolean(row.has_work_photos),
                    reviewSummary: (row.review_summary as string | null) ?? null,
                    responseProfile: (row.response_profile as string | null) ?? null,
                    websiteQuality: (row.website_quality as string | null) ?? null,
                    enrichedAt: (row.enriched_at as string | null) ?? null,
                    profileCompleteness:
                        typeof row.profile_completeness === 'number'
                            ? Math.max(0, Math.min(3, row.profile_completeness))
                            : 0,
                    cacheVersion:
                        typeof row.cache_version === 'number' && row.cache_version > 0
                            ? Math.floor(row.cache_version)
                            : 1,
                };
                // Support both key shapes during migration:
                // - canonical "places/<id>" (DB form)
                // - raw "<id>" (legacy frontend placeId form)
                cache[gid] = entry;
                const rawId = gid.replace(/^places\//, '');
                cache[rawId] = entry;
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
        enrichGetResponseCache.set(requestKey, {
            value: result,
            expiresAt: Date.now() + ENRICH_GET_CACHE_TTL_MS,
        });
        logStage('response cached in memory', 'memory_cache_set');

        return NextResponse.json({
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
        });
    } catch (err) {
        console.error('[enrich/get] Error:', err);
        return NextResponse.json({ cache: {} });
    }
}
