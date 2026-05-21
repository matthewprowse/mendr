// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GEMINI_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

/**
 * POST /api/enrich/queue
 *
 * Accepts a list of Google Place IDs and an optional trade hint.
 * Maps each to a providers.id then runs enrichment with max 10 concurrent jobs.
 *
 * Body: { placeIds: string[]; trade?: string; mode?: 'full'; ... }
 *
 * - Default (omit mode or `summary_fast`): DB reviews + one small Gemini call (~1s) — no scrape/images.
 * - `full`: scrape + images + combined AI — 30s per-job cap.
 *
 * The client fires this without awaiting the response (fire-and-forget).
 * maxDuration is set to 300s so Vercel Pro does not kill in-flight jobs.
 */

// R3: Allow up to 5 minutes on Vercel Pro — prevents serverless function kills mid-enrichment.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { enrichProvider, enrichProviderReviewSummaryFast } from '@/lib/providers/provider-enrichment';
import { expandPlaceIdsForDbQuery, toGooglePlaceId } from '@/lib/providers/persistence';
import { checkRateLimit } from '@/lib/rate-limit-config';

const MAX_CONCURRENT_FAST = 10;
const MAX_CONCURRENT_FULL = 3;
const JOB_TIMEOUT_FULL_MS = 60_000;
/** Wall budget for fast review-summary jobs (Gemini + DB; slightly above model timeout). */
/** Must cover cold DB + Gemini; 8s caused silent timeouts before cache upsert (see debug S_GET rows=0). */
const JOB_TIMEOUT_SUMMARY_FAST_MS = 30_000;
const MAX_PLACE_IDS  = 30;

// ── Simple semaphore ──────────────────────────────────────────────────────────

function createSemaphore(max: number) {
    let running = 0;
    const queue: (() => void)[] = [];

    return async function acquire(): Promise<() => void> {
        if (running < max) {
            running++;
            const release = () => {
                running--;
                const next = queue.shift();
                if (next) next();
            };
            return release;
        }
        return new Promise((resolve) => {
            queue.push(() => {
                running++;
                resolve(() => {
                    running--;
                    const next = queue.shift();
                    if (next) next();
                });
            });
        });
    };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'enrichQueue');
    if (limited) return limited;

    try {
        const t0 = Date.now();
        const stageTimings: Record<string, number> = {};
        const logStage = (_label: string, key?: string) => {
            const elapsed = Date.now() - t0;
            if (key) stageTimings[key] = elapsed;
        };
        const body = await req.json().catch(() => null) as {
            placeIds?: unknown;
            providerIds?: unknown;
            trade?: unknown;
            priorityPlaceId?: unknown;
            cacheVersion?: unknown;
            mode?: unknown;
            /**
             * Free-form trace tag for why this re-enrichment was triggered (e.g. 'leak_detected').
             * Logged but not used for scheduling; helps diagnose noisy queue traffic.
             */
            reason?: unknown;
        } | null;

        const parsedBody = body ?? {};
        const rawPlaces = Array.isArray(parsedBody.placeIds) ? parsedBody.placeIds : [];
        const rawProviderIds =
            Array.isArray(parsedBody.providerIds)
                ? (parsedBody.providerIds as unknown[]).filter((id) => typeof id === 'string' && id.trim())
                : [];

        const placeIds = (rawPlaces as string[])
            .filter((id) => typeof id === 'string' && id.trim())
            .map((id) => toGooglePlaceId(id.trim()))
            .slice(0, MAX_PLACE_IDS);
        const UUID_RE =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const providerIdsFromBody = (rawProviderIds as string[])
            .map((id) => (typeof id === 'string' ? id.trim() : ''))
            .slice(0, MAX_PLACE_IDS);
        const nonEmptyProviderIds = providerIdsFromBody.filter((id) => UUID_RE.test(id));

        if (placeIds.length === 0 && nonEmptyProviderIds.length === 0) {
            return NextResponse.json({ error: 'placeIds or providerIds required' }, { status: 400 });
        }

        const placeIdsForQuery = placeIds.length > 0 ? expandPlaceIdsForDbQuery(placeIds) : [];
        logStage(
            `place ids (count=${placeIds.length}), provider uuids (count=${nonEmptyProviderIds.length}), queryVariants=${placeIdsForQuery.length}`,
            'place_ids_normalized'
        );

        const trade = typeof parsedBody.trade === 'string' && parsedBody.trade.trim()
            ? parsedBody.trade.trim()
            : undefined;
        const priorityPlaceId =
            typeof parsedBody.priorityPlaceId === 'string' && parsedBody.priorityPlaceId.trim()
                ? toGooglePlaceId(parsedBody.priorityPlaceId.trim())
                : null;
        const cacheVersionRaw =
            typeof parsedBody.cacheVersion === 'number'
                ? parsedBody.cacheVersion
                : typeof parsedBody.cacheVersion === 'string'
                  ? Number.parseInt(parsedBody.cacheVersion, 10)
                  : NaN;
        const cacheVersion =
            Number.isFinite(cacheVersionRaw) && cacheVersionRaw > 0
                ? Math.floor(cacheVersionRaw)
                : undefined;

        const reason =
            typeof parsedBody.reason === 'string' && parsedBody.reason.trim()
                ? parsedBody.reason.trim().slice(0, 64)
                : null;
        if (reason) {
            logStage(`reason="${reason}"`, 'reason_recorded');
        }

        const modeRaw =
            typeof parsedBody.mode === 'string' ? parsedBody.mode.trim().toLowerCase() : '';
        // Default: fast review-summary path (~1s/provider). Opt in to full scrape pipeline with mode "full".
        const summaryFast = modeRaw !== 'full' && modeRaw !== 'enrich_full';
        const runJob = summaryFast
            ? async (id: string) => {
                  const r = await enrichProviderReviewSummaryFast(id, { trade, cacheVersion });
                  if (!r.ok) throw new Error(r.reason ?? 'Fast enrich failed');
              }
            : async (id: string) => {
                  const r = await enrichProvider(id, { trade, cacheVersion });
                  if (!r.ok) throw new Error(r.reason ?? 'Enrich failed');
              };
        const jobTimeoutMs = summaryFast ? JOB_TIMEOUT_SUMMARY_FAST_MS : JOB_TIMEOUT_FULL_MS;

        // Resolve Google Place IDs → internal provider UUIDs (fallback: internal UUIDs from match cards)
        const admin = await createSupabaseAdminClient();
        let providers: { id: string; google_place_id: string }[] = [];

        if (placeIdsForQuery.length > 0) {
            const { data: byPlace } = await admin
                .from('providers')
                .select('id, google_place_id')
                .eq('is_active', true)
                .in('google_place_id', placeIdsForQuery);
            providers = (byPlace ?? []) as { id: string; google_place_id: string }[];
            logStage(`providers by place (count=${providers.length})`, 'providers_resolved');
        }

        if (providers.length === 0 && nonEmptyProviderIds.length > 0) {
            const { data: byId } = await admin
                .from('providers')
                .select('id, google_place_id')
                .eq('is_active', true)
                .in('id', nonEmptyProviderIds);
            const rows = (byId ?? []) as { id: string; google_place_id: string }[];
            const orderMap = new Map(nonEmptyProviderIds.map((id, idx) => [id, idx]));
            providers = [...rows].sort(
                (a, b) =>
                    (orderMap.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) -
                    (orderMap.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER)
            );
            logStage(`providers by id fallback (count=${providers.length})`, 'providers_by_uuid');
        }

        if (providers.length === 0) {
            return NextResponse.json({ queued: 0, processed: 0 });
        }

        const inputOrder = new Map<string, number>();
        placeIds.forEach((id, idx) => inputOrder.set(id, idx));
        const orderedProviders = [...providers].sort((a, b) => {
            const aId = String((a as { google_place_id?: string }).google_place_id ?? '');
            const bId = String((b as { google_place_id?: string }).google_place_id ?? '');
            if (priorityPlaceId) {
                if (aId === priorityPlaceId && bId !== priorityPlaceId) return -1;
                if (bId === priorityPlaceId && aId !== priorityPlaceId) return 1;
            }
            const aOrder = inputOrder.get(aId) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = inputOrder.get(bId) ?? Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder;
        });

        const semaphore = createSemaphore(summaryFast ? MAX_CONCURRENT_FAST : MAX_CONCURRENT_FULL);

        // IMPORTANT: run jobs within the request lifetime.
        // In serverless environments, detached async work after returning a response
        // is not guaranteed to continue, which can leave most summaries unprocessed.
        await Promise.all(
            orderedProviders.map(async (p) => {
                const release = await semaphore();
                const pid = String(p.id);
                try {
                    await Promise.race([
                        runJob(pid),
                        new Promise<void>((_, reject) =>
                            setTimeout(
                                () => reject(new Error('Job timeout')),
                                jobTimeoutMs
                            )
                        ),
                    ]);
                } catch {
                    /* job failed or timed out — enrichProvider* logs details */
                } finally {
                    release();
                }
            })
        );

        logStage(`jobs completed (count=${orderedProviders.length})`, 'jobs_completed');
        return NextResponse.json({
            queued: orderedProviders.length,
            processed: orderedProviders.length,
            ...(process.env.NODE_ENV === 'development'
                ? {
                    debugTiming: {
                        totalMs: Date.now() - t0,
                        stages: stageTimings,
                        completedJobs: orderedProviders.length,
                    },
                }
                : {}),
        });
    } catch (err) {
        console.error('[enrich/queue] Unhandled error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
