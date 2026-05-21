// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    CRON_SECRET, GEMINI_API_KEY

/**
 * /api/enrich/prewarm
 *
 * Runs daily at 3am — after the 2am DataForSEO review sync.
 *
 * Processes up to 150 providers per run with 3-concurrent enrichment to
 * respect Gemini rate limits. Providers with `needs_enrichment = true`
 * (set by the review sync when ≥3 new reviews arrived) are always processed
 * first, regardless of cache age. After successful enrichment the flag is cleared.
 *
 * At 30-day cache TTL and 150 providers per run, the cycle is ~3.2 days —
 * well within the TTL and far better than the old 9.5-day cycle.
 *
 * Usage
 * ─────
 * GET /api/enrich/prewarm
 *   - Must be authenticated via CRON_SECRET header (same as other cron jobs)
 *   - Optional query params:
 *       maxTotal    — total providers to process per run (default 150, max 300)
 *       trade       — filter to a specific trade label (optional)
 *       forceRefresh — "true" to skip cache TTL check and re-enrich everything
 *
 * Schedule: "0 3 * * *" (defined in vercel.json)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { enrichProvider } from '@/lib/providers/provider-enrichment';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

const DEFAULT_MAX_TOTAL   = 150;
const MAX_MAX_TOTAL       = 300;
/** How many providers to enrich in parallel. 3 is safe under Gemini flash rate limits. */
const CONCURRENCY         = 3;

/**
 * Providers with cache older than this are eligible for pre-warm.
 * Set to 27 days — 3 days before the 30-day cache TTL expires.
 */
const PREWARM_ELIGIBLE_TTL_MS = 27 * 24 * 60 * 60 * 1000;

interface PrewarmOutcome {
    providerId:  string;
    name:        string;
    ok:          boolean;
    skipped:     boolean;
    prioritised: boolean;
    reason?:     string;
    durationMs:  number;
}

export async function GET(req: NextRequest) {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const maxTotal = Math.min(
        parseInt(searchParams.get('maxTotal') ?? String(DEFAULT_MAX_TOTAL), 10) || DEFAULT_MAX_TOTAL,
        MAX_MAX_TOTAL,
    );
    const tradeFilter  = searchParams.get('trade') ?? null;
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    try {
        const admin = await createSupabaseAdminClient();
        const eligibleCutoff = new Date(Date.now() - PREWARM_ELIGIBLE_TTL_MS).toISOString();

        // ── Identify fresh providers that DON'T need re-enrichment ───────────
        const { data: freshCacheRows } = await admin
            .from('provider_cache')
            .select('provider_id, needs_enrichment')
            .eq('scrape_status', 'ok')
            .neq('enrichment_quality', 'low')
            .gt('enriched_at', eligibleCutoff)
            .not('provider_id', 'is', null);

        // Fresh AND not flagged for re-enrichment
        const freshIds = new Set<string>(
            (freshCacheRows ?? [])
                .filter((r) => !(r as { needs_enrichment?: boolean }).needs_enrichment)
                .map((r) => (r as { provider_id: string }).provider_id),
        );

        // Providers flagged for re-enrichment (even if cache is fresh)
        const needsEnrichmentIds = new Set<string>(
            (freshCacheRows ?? [])
                .filter((r) => (r as { needs_enrichment?: boolean }).needs_enrichment)
                .map((r) => (r as { provider_id: string }).provider_id),
        );

        // ── Fetch all active providers ────────────────────────────────────────
        let query = admin
            .from('providers')
            .select('id, name, specialisations')
            .eq('is_active', true)
            .limit(maxTotal * 4); // over-fetch; filtered below

        if (tradeFilter) {
            query = query.ilike('specialisations', `%${tradeFilter}%`);
        }

        const { data: allProviders, error: provErr } = await query;

        if (provErr) {
            return NextResponse.json({ error: provErr.message }, { status: 500 });
        }

        // ── Build candidate list: needs_enrichment providers FIRST ──────────
        const all = allProviders ?? [];
        const prioritised = all.filter((p) => needsEnrichmentIds.has((p as { id: string }).id));
        const normal      = all.filter((p) => {
            const id = (p as { id: string }).id;
            return !needsEnrichmentIds.has(id) && (forceRefresh || !freshIds.has(id));
        });

        const candidates = [...prioritised, ...normal].slice(0, maxTotal);

        if (candidates.length === 0) {
            return NextResponse.json({
                ok:        true,
                message:   'All providers already have fresh cache',
                attempted: 0,
                outcomes:  [],
            });
        }

        // ── Process with CONCURRENCY=3 to respect Gemini rate limits ─────────
        const outcomes: PrewarmOutcome[] = [];
        const isPrioritised = (id: string) => needsEnrichmentIds.has(id);

        for (let i = 0; i < candidates.length; i += CONCURRENCY) {
            const batch = candidates.slice(i, i + CONCURRENCY);

            const batchResults = await Promise.all(
                batch.map(async (provider) => {
                    const id   = (provider as { id: string }).id;
                    const name = (provider as { name?: string }).name ?? id;
                    const t0   = Date.now();

                    try {
                        const result = await enrichProvider(id, { trade: tradeFilter ?? undefined });

                        // Clear needs_enrichment flag after successful full enrichment
                        if (isPrioritised(id) && result.ok && !result.skipped) {
                            void admin
                                .from('provider_cache')
                                .update({ needs_enrichment: false })
                                .eq('provider_id', id)
                                .then(({ error }) => {
                                    if (error) console.warn(JSON.stringify({ type: 'prewarm_clear_flag_error', provider_id: id, error: error.message }));
                                });
                        }

                        return {
                            providerId:  id,
                            name,
                            ok:          result.ok,
                            skipped:     result.skipped ?? false,
                            prioritised: isPrioritised(id),
                            reason:      result.reason,
                            durationMs:  Date.now() - t0,
                        } satisfies PrewarmOutcome;
                    } catch (e) {
                        return {
                            providerId:  id,
                            name,
                            ok:          false,
                            skipped:     false,
                            prioritised: isPrioritised(id),
                            reason:      e instanceof Error ? e.message : 'Unknown error',
                            durationMs:  Date.now() - t0,
                        } satisfies PrewarmOutcome;
                    }
                }),
            );

            outcomes.push(...batchResults);
        }

        const succeeded   = outcomes.filter((o) => o.ok && !o.skipped).length;
        const skipped     = outcomes.filter((o) => o.skipped).length;
        const failed      = outcomes.filter((o) => !o.ok).length;
        const prioritisedCount = outcomes.filter((o) => o.prioritised).length;

        return NextResponse.json({
            ok:          true,
            attempted:   outcomes.length,
            succeeded,
            skipped,
            failed,
            prioritised: prioritisedCount,
            outcomes,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
