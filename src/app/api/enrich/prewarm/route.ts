/**
 * /api/enrich/prewarm
 *
 * Pre-warms the enrichment cache for ALL active providers in the database.
 *
 * Why this matters
 * ─────────────────
 * The background enrichment pipeline currently runs per-provider only when
 * they first appear in a match result. This means the first user to be shown
 * a new provider always waits for enrichment to happen in real time, adding
 * latency and potentially showing blank provider cards.
 *
 * Running this job (e.g. daily via Vercel cron) means every provider in the
 * database has a warm cache entry before any homeowner sees them. The Agent 3
 * "fast review summary" fallback never needs to fire for established providers.
 *
 * Usage
 * ─────
 * GET /api/enrich/prewarm
 *   - Must be authenticated via CRON_SECRET header (same as other cron jobs)
 *   - Optional query params:
 *       batchSize   — providers per batch (default 10, max 20)
 *       maxTotal    — total providers to process per run (default 50, max 200)
 *       trade       — filter to a specific trade label (optional)
 *       forceRefresh — "true" to skip cache TTL check and re-enrich everything
 *
 * In production, add this to vercel.json:
 *   { "path": "/api/enrich/prewarm", "schedule": "0 3 * * *" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { enrichProvider } from '@/lib/provider-enrichment';

export const dynamic = 'force-dynamic';
// Allow up to 5 minutes for large batches
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 20;
const DEFAULT_MAX_TOTAL = 50;
const MAX_MAX_TOTAL = 200;

// Providers with cache older than this are eligible for pre-warm
const PREWARM_ELIGIBLE_TTL_MS = 12 * 24 * 60 * 60 * 1000; // 12 days (2 days before 14-day cache expires)

interface PrewarmOutcome {
    providerId: string;
    name: string;
    ok: boolean;
    skipped: boolean;
    reason?: string;
    durationMs: number;
}

export async function GET(req: NextRequest) {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const batchSize = Math.min(
        parseInt(searchParams.get('batchSize') ?? String(DEFAULT_BATCH_SIZE), 10) || DEFAULT_BATCH_SIZE,
        MAX_BATCH_SIZE,
    );
    const maxTotal = Math.min(
        parseInt(searchParams.get('maxTotal') ?? String(DEFAULT_MAX_TOTAL), 10) || DEFAULT_MAX_TOTAL,
        MAX_MAX_TOTAL,
    );
    const tradeFilter = searchParams.get('trade') ?? null;
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    try {
        const admin = await createSupabaseAdminClient();

        // ── Fetch providers that need pre-warming ──────────────────────────────
        // Candidates: active providers with no cache row, stale cache, or low-quality enrichment.
        const eligibleCutoff = new Date(Date.now() - PREWARM_ELIGIBLE_TTL_MS).toISOString();

        // Sub-query: provider IDs that already have fresh, high-quality cache
        const { data: freshCacheRows } = await admin
            .from('provider_cache')
            .select('provider_id')
            .eq('scrape_status', 'ok')
            .neq('enrichment_quality', 'low')
            .gt('enriched_at', eligibleCutoff)
            .not('provider_id', 'is', null);

        const freshIds = new Set<string>(
            (freshCacheRows ?? []).map((r) => (r as { provider_id: string }).provider_id),
        );

        // Fetch all active providers
        let providersQuery = admin
            .from('providers')
            .select('id, name, specialisations')
            .eq('is_active', true)
            .limit(maxTotal * 3); // fetch more than needed so we can filter

        if (tradeFilter) {
            // Filter by trade label (stored in specialisations array or a trade column)
            providersQuery = providersQuery.ilike('specialisations', `%${tradeFilter}%`);
        }

        const { data: allProviders, error: provErr } = await providersQuery;

        if (provErr) {
            return NextResponse.json({ error: provErr.message }, { status: 500 });
        }

        // Filter out already-warm providers (unless forceRefresh)
        const candidates = (allProviders ?? [])
            .filter((p) => {
                const id = (p as { id: string }).id;
                return forceRefresh || !freshIds.has(id);
            })
            .slice(0, maxTotal);

        if (candidates.length === 0) {
            return NextResponse.json({
                ok: true,
                message: 'All providers already have fresh cache',
                attempted: 0,
                outcomes: [],
            });
        }

        // ── Process in batches to avoid overwhelming Gemini rate limits ────────
        const outcomes: PrewarmOutcome[] = [];
        let batchStart = 0;

        while (batchStart < candidates.length) {
            const batch = candidates.slice(batchStart, batchStart + batchSize);
            batchStart += batchSize;

            // Process each provider in the batch sequentially to stay within
            // Gemini's per-minute rate limits. Parallel processing risks 429s.
            for (const provider of batch) {
                const id = (provider as { id: string }).id;
                const name = (provider as { name?: string }).name ?? id;
                const t0 = Date.now();

                try {
                    const result = await enrichProvider(id, { trade: tradeFilter ?? undefined });
                    outcomes.push({
                        providerId: id,
                        name,
                        ok: result.ok,
                        skipped: result.skipped ?? false,
                        reason: result.reason,
                        durationMs: Date.now() - t0,
                    });
                } catch (e) {
                    outcomes.push({
                        providerId: id,
                        name,
                        ok: false,
                        skipped: false,
                        reason: e instanceof Error ? e.message : 'Unknown error',
                        durationMs: Date.now() - t0,
                    });
                }
            }

            // Brief pause between batches to respect rate limits
            if (batchStart < candidates.length) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        const succeeded = outcomes.filter((o) => o.ok && !o.skipped).length;
        const skipped = outcomes.filter((o) => o.skipped).length;
        const failed = outcomes.filter((o) => !o.ok).length;

        return NextResponse.json({
            ok: true,
            attempted: outcomes.length,
            succeeded,
            skipped,
            failed,
            outcomes,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
