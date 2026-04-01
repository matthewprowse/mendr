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

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = checkRateLimit(req, 'enrichGet');
    if (limited) return limited;

    try {
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

        const admin = await createSupabaseAdminClient();

        const { data: rows } = await admin
            .from('provider_cache')
            .select(
                'google_place_id, bio, specialisations, has_work_photos, review_summary, response_profile, website_quality, enriched_at, profile_completeness, cache_version'
            )
            .in('google_place_id', placeIds)
            .eq('scrape_status', 'ok');

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

        return NextResponse.json({
            cache,
            currentCacheVersion: aiConfig.providerEnrichmentCacheVersion,
        });
    } catch (err) {
        console.error('[enrich/get] Error:', err);
        return NextResponse.json({ cache: {} });
    }
}
