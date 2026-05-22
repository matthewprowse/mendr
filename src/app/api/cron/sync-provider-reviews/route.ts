// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    CRON_SECRET, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

/**
 * Cron: sync-provider-reviews
 *
 * Runs daily at 2am — one hour before the prewarm enrichment job.
 * Fetches fresh reviews from DataForSEO for providers that have a Google Place
 * ID and haven't been synced recently, then persists them via review-ingestion.
 *
 * When ≥3 new reviews land for a provider, `provider_cache.needs_enrichment`
 * is set to true — the 3am prewarm job picks this up and runs full enrichment
 * for those providers first.
 *
 * Schedule: "0 2 * * *" (see vercel.json)
 * Auth:     CRON_SECRET via isAuthorizedCronRequest
 *
 * Query params:
 *   limit  — providers to process per run (default 60, max 200)
 *   dryRun — "true" to fetch from DataForSEO but not write to DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { fetchDataForSEOReviews } from '@/lib/providers/dataforseo-client';
import { ingestDataForSEOReviews } from '@/lib/providers/review-ingestion';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — Vercel Pro/Enterprise limit

const DEFAULT_LIMIT  = 60;
const MAX_LIMIT      = 200;
/** Re-sync providers whose reviews haven't been checked in this many days. */
const SYNC_TTL_DAYS  = 7;
/** Brief pause between DataForSEO requests to respect rate limits. */
const BETWEEN_MS     = 300;

interface SyncOutcome {
    providerId:   string;
    name:         string;
    ok:           boolean;
    added:        number;
    unchanged:    number;
    skipped:      boolean;
    reason?:      string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit  = Math.min(
        parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
        MAX_LIMIT,
    );
    const dryRun = searchParams.get('dryRun') === 'true';

    const admin = await createSupabaseAdminClient();
    const now   = new Date();
    const syncCutoff = new Date(now.getTime() - SYNC_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Candidates: active providers with a Google Place ID that haven't been synced recently.
    // `reviews_synced_at IS NULL` catches providers that have never been synced.
    const { data: candidates, error: fetchErr } = await admin
        .from('providers')
        .select('id, name, google_place_id, rating_count')
        .eq('is_active', true)
        .not('google_place_id', 'is', null)
        .or(`reviews_synced_at.is.null,reviews_synced_at.lt.${syncCutoff}`)
        .order('reviews_synced_at', { ascending: true, nullsFirst: true })
        .limit(limit);

    if (fetchErr) {
        console.error(JSON.stringify({ type: 'sync_reviews_fetch_error', error: fetchErr.message }));
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const providers = (candidates ?? []) as Array<{ id: string; name: string; google_place_id: string; rating_count?: number | null }>;

    if (providers.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, message: 'All providers synced recently' });
    }

    const outcomes: SyncOutcome[] = [];

    for (const provider of providers) {
        const { id: providerId, name, google_place_id: placeId, rating_count: storedRatingCount } = provider;

        try {
            const result = await fetchDataForSEOReviews(placeId);

            if (!result) {
                outcomes.push({ providerId, name, ok: false, added: 0, unchanged: 0, skipped: false, reason: 'DataForSEO fetch failed' });
                // Brief pause even on failure to avoid hammering the API
                await new Promise((r) => setTimeout(r, BETWEEN_MS));
                continue;
            }

            // Skip ingestion if Google's total count hasn't grown since our last sync.
            // This prevents wasting DB writes when DataForSEO returns the same reviews we already have.
            if (
                result.rating_count !== null &&
                typeof storedRatingCount === 'number' &&
                result.rating_count <= storedRatingCount
            ) {
                if (!dryRun) {
                    void admin
                        .from('providers')
                        .update({ reviews_synced_at: now.toISOString(), updated_at: now.toISOString() })
                        .eq('id', providerId);
                }
                outcomes.push({ providerId, name, ok: true, added: 0, unchanged: 0, skipped: true, reason: 'No new reviews (rating_count unchanged)' });
                await new Promise((r) => setTimeout(r, BETWEEN_MS));
                continue;
            }

            if (result.reviews.length === 0) {
                // Provider has no reviews (or DataForSEO found none) — still update reviews_synced_at
                if (!dryRun) {
                    void admin
                        .from('providers')
                        .update({ reviews_synced_at: now.toISOString(), updated_at: now.toISOString() })
                        .eq('id', providerId);
                }
                outcomes.push({ providerId, name, ok: true, added: 0, unchanged: 0, skipped: true, reason: 'No reviews found' });
                await new Promise((r) => setTimeout(r, BETWEEN_MS));
                continue;
            }

            if (dryRun) {
                outcomes.push({ providerId, name, ok: true, added: result.reviews.length, unchanged: 0, skipped: false, reason: 'dry_run' });
                await new Promise((r) => setTimeout(r, BETWEEN_MS));
                continue;
            }

            const ingestion = await ingestDataForSEOReviews(providerId, placeId, result.reviews);
            outcomes.push({
                providerId,
                name,
                ok:        true,
                added:     ingestion.added,
                unchanged: ingestion.unchanged,
                skipped:   false,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(JSON.stringify({ type: 'sync_reviews_provider_error', provider_id: providerId, error: msg }));
            outcomes.push({ providerId, name, ok: false, added: 0, unchanged: 0, skipped: false, reason: msg });
        }

        await new Promise((r) => setTimeout(r, BETWEEN_MS));
    }

    const totalAdded     = outcomes.reduce((s, o) => s + o.added, 0);
    const needsEnrichment = outcomes.filter((o) => o.added >= 3).length;
    const failed          = outcomes.filter((o) => !o.ok).length;

    console.warn(JSON.stringify({
        type:              'sync_reviews_complete',
        processed:         outcomes.length,
        total_added:       totalAdded,
        needs_enrichment:  needsEnrichment,
        failed,
        dry_run:           dryRun,
    }));

    return NextResponse.json({
        ok:               true,
        processed:        outcomes.length,
        totalAdded,
        needsEnrichment,
        failed,
        dryRun,
        outcomes,
    });
}

/** Support POST for manual triggers. */
export async function POST(req: NextRequest): Promise<NextResponse> {
    return GET(req);
}
