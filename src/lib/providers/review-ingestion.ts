/**
 * Review ingestion — upsert DataForSEO reviews into the reviews table.
 *
 * Deduplication: (provider_id, source, source_ref) unique index.
 * For DataForSEO, source_ref is the review_url returned by the API.
 * If review_url is absent (rare), we fall back to a stable content hash
 * so the row is still stored but won't be re-imported on subsequent syncs.
 *
 * Returns counts so the caller can decide whether to trigger re-enrichment.
 */

import crypto from 'crypto';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import type { DataForSEOReview } from '@/lib/providers/dataforseo-client';

export interface ReviewIngestionResult {
    added:              number;
    unchanged:          number;
    reviewCountBefore:  number;
    reviewCountAfter:   number;
}

/** Threshold: trigger re-enrichment when this many new reviews are added. */
export const NEEDS_ENRICHMENT_THRESHOLD = 3;

/** Reviews older than this are not ingested — businesses can change significantly over 3 years. */
const REVIEW_MAX_AGE_YEARS = 3;

/** Maximum DataForSEO reviews stored per provider. Oldest are pruned when this is exceeded. */
export const MAX_REVIEWS_PER_PROVIDER = 100;

function makeContentHash(providerId: string, reviewText: string, reviewerName: string | null): string {
    const payload = `${providerId}::${(reviewerName ?? '').trim()}::${reviewText.trim()}`;
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 64);
}

/**
 * Ingest DataForSEO reviews for a single provider.
 *
 * Upserts all non-empty reviews into the `reviews` table.
 * Updates `provider_cache.last_review_count` and sets `needs_enrichment = true`
 * when ≥NEEDS_ENRICHMENT_THRESHOLD new reviews were added.
 */
export async function ingestDataForSEOReviews(
    providerId: string,
    googlePlaceId: string,
    reviews: DataForSEOReview[],
): Promise<ReviewIngestionResult> {
    const admin = await createSupabaseAdminClient();
    const now   = new Date().toISOString();

    // Count reviews already in DB for this provider from all sources
    const { count: countBefore } = await admin
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId);

    const reviewCountBefore = countBefore ?? 0;

    if (reviews.length === 0) {
        return { added: 0, unchanged: 0, reviewCountBefore, reviewCountAfter: reviewCountBefore };
    }

    // Drop reviews older than REVIEW_MAX_AGE_YEARS — stale opinions misrepresent current quality.
    const cutoffMs = Date.now() - REVIEW_MAX_AGE_YEARS * 365.25 * 24 * 60 * 60 * 1000;
    const freshReviews = reviews.filter((r) => {
        if (!r.timestamp) return true; // keep if no timestamp (can't judge age)
        const ts = new Date(r.timestamp).getTime();
        return Number.isFinite(ts) && ts >= cutoffMs;
    });

    if (freshReviews.length === 0) {
        return { added: 0, unchanged: 0, reviewCountBefore, reviewCountAfter: reviewCountBefore };
    }

    const rows = freshReviews.map((r) => {
        const sourceRef = r.review_url?.trim()
            ? r.review_url.trim().slice(0, 512)
            : makeContentHash(providerId, r.review_text ?? '', r.reviewer_name);

        return {
            provider_id:    providerId,
            source:         'dataforseo' as const,
            source_ref:     sourceRef,
            reviewer_name:  r.reviewer_name?.slice(0, 255) ?? null,
            rating:         r.rating,
            body:           (r.review_text ?? '').slice(0, 5000),
            published_at:   r.timestamp ?? null,
            status:         'approved' as const,
            updated_at:     now,
        };
    });

    // Upsert — on conflict (provider_id, source, source_ref), do nothing.
    // We never overwrite existing rows to preserve any manual edits.
    const { error: upsertErr, data: upserted } = await admin
        .from('reviews')
        .upsert(rows, {
            onConflict:        'provider_id,source,source_ref',
            ignoreDuplicates:  true,
        })
        .select('id');

    if (upsertErr) {
        console.error(JSON.stringify({
            type:        'review_ingestion_upsert_error',
            provider_id: providerId,
            error:       upsertErr.message,
        }));
        return { added: 0, unchanged: rows.length, reviewCountBefore, reviewCountAfter: reviewCountBefore };
    }

    // `ignoreDuplicates: true` means only truly new rows come back in `data`
    const added = Array.isArray(upserted) ? upserted.length : 0;

    const { count: countAfter } = await admin
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId);

    const reviewCountAfter = countAfter ?? reviewCountBefore + added;

    // Prune oldest DataForSEO reviews if the provider is over the cap.
    // We only prune the 'dataforseo' source — mendr (in-app) reviews are never auto-deleted.
    if (reviewCountAfter > MAX_REVIEWS_PER_PROVIDER) {
        const excess = reviewCountAfter - MAX_REVIEWS_PER_PROVIDER;
        const { data: oldest } = await admin
            .from('reviews')
            .select('id')
            .eq('provider_id', providerId)
            .eq('source', 'dataforseo')
            .order('published_at', { ascending: true })
            .limit(excess);
        if (Array.isArray(oldest) && oldest.length > 0) {
            const idsToDelete = oldest.map((r) => r.id);
            await admin.from('reviews').delete().in('id', idsToDelete);
        }
    }

    // Update provider_cache tracking columns
    const cacheUpdate: Record<string, unknown> = {
        last_review_count: reviewCountAfter,
        updated_at:        now,
    };
    if (added >= NEEDS_ENRICHMENT_THRESHOLD) {
        cacheUpdate.needs_enrichment = true;
    }

    const { error: cacheErr } = await admin
        .from('provider_cache')
        .update(cacheUpdate)
        .eq('provider_id', providerId);

    if (cacheErr) {
        console.warn(JSON.stringify({
            type:        'review_ingestion_cache_update_error',
            provider_id: providerId,
            error:       cacheErr.message,
        }));
    }

    // Update providers.reviews_synced_at so we know when this provider was last synced
    void admin
        .from('providers')
        .update({ reviews_synced_at: now, updated_at: now })
        .eq('id', providerId)
        .then(({ error }) => {
            if (error) {
                console.warn(JSON.stringify({ type: 'review_ingestion_provider_update_error', provider_id: providerId, error: error.message }));
            }
        });

    console.warn(JSON.stringify({
        type:        'review_ingestion_complete',
        provider_id: providerId,
        added,
        unchanged:   rows.length - added,
        count_before: reviewCountBefore,
        count_after:  reviewCountAfter,
        needs_enrichment: added >= NEEDS_ENRICHMENT_THRESHOLD,
    }));

    return {
        added,
        unchanged:  rows.length - added,
        reviewCountBefore,
        reviewCountAfter,
    };
}
