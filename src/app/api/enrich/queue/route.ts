/**
 * POST /api/enrich/queue
 *
 * Accepts a list of Google Place IDs and an optional trade hint.
 * Maps each to a providers.id then runs the enrichment pipeline with
 * max 10 concurrent jobs and a 30-second per-job timeout.
 *
 * Body: { placeIds: string[]; trade?: string }
 *
 * The client fires this without awaiting the response (fire-and-forget).
 * maxDuration is set to 300s so Vercel Pro does not kill in-flight jobs.
 */

// R3: Allow up to 5 minutes on Vercel Pro — prevents serverless function kills mid-enrichment.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { enrichProvider } from '@/lib/provider-enrichment';
import { toGooglePlaceId } from '@/app/api/providers/persistence';
import { checkRateLimit } from '@/lib/rate-limit-config';

const MAX_CONCURRENT = 10;
const JOB_TIMEOUT_MS = 30_000;
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
    const limited = checkRateLimit(req, 'enrichQueue');
    if (limited) return limited;

    try {
        const t0 = Date.now();
        const stageTimings: Record<string, number> = {};
        const logStage = (label: string, key?: string) => {
            if (process.env.NODE_ENV === 'development') {
                const elapsed = Date.now() - t0;
                if (key) stageTimings[key] = elapsed;
                console.log(`[enrich/queue] ${label} at +${elapsed}ms`);
            }
        };
        const body = await req.json().catch(() => null) as {
            placeIds?: unknown;
            trade?: unknown;
            priorityPlaceId?: unknown;
            cacheVersion?: unknown;
        } | null;

        if (!body || !Array.isArray(body.placeIds) || body.placeIds.length === 0) {
            return NextResponse.json({ error: 'placeIds array required' }, { status: 400 });
        }

        const placeIds = (body.placeIds as string[])
            .filter((id) => typeof id === 'string' && id.trim())
            .map((id) => toGooglePlaceId(id.trim()))
            .slice(0, MAX_PLACE_IDS);
        logStage(`normalized place ids (count=${placeIds.length})`, 'place_ids_normalized');

        const trade = typeof body.trade === 'string' && body.trade.trim()
            ? body.trade.trim()
            : undefined;
        const priorityPlaceId =
            typeof body.priorityPlaceId === 'string' && body.priorityPlaceId.trim()
                ? toGooglePlaceId(body.priorityPlaceId.trim())
                : null;
        const cacheVersionRaw =
            typeof body.cacheVersion === 'number'
                ? body.cacheVersion
                : typeof body.cacheVersion === 'string'
                  ? Number.parseInt(body.cacheVersion, 10)
                  : NaN;
        const cacheVersion =
            Number.isFinite(cacheVersionRaw) && cacheVersionRaw > 0
                ? Math.floor(cacheVersionRaw)
                : undefined;

        // Resolve Google Place IDs → internal provider UUIDs
        const admin = await createSupabaseAdminClient();
        const { data: providers } = await admin
            .from('providers')
            .select('id, google_place_id')
            .in('google_place_id', placeIds);
        logStage(`providers resolved (count=${providers?.length ?? 0})`, 'providers_resolved');

        if (!providers || providers.length === 0) {
            return NextResponse.json({ queued: 0, processed: 0 });
        }

        const inputOrder = new Map<string, number>();
        placeIds.forEach((id, idx) => inputOrder.set(id, idx));
        const orderedProviders = [...providers].sort((a, b) => {
            const aId = String((a as any).google_place_id ?? '');
            const bId = String((b as any).google_place_id ?? '');
            if (priorityPlaceId) {
                if (aId === priorityPlaceId && bId !== priorityPlaceId) return -1;
                if (bId === priorityPlaceId && aId !== priorityPlaceId) return 1;
            }
            const aOrder = inputOrder.get(aId) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = inputOrder.get(bId) ?? Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder;
        });

        const semaphore = createSemaphore(MAX_CONCURRENT);

        // IMPORTANT: run jobs within the request lifetime.
        // In serverless environments, detached async work after returning a response
        // is not guaranteed to continue, which can leave most summaries unprocessed.
        await Promise.all(
            orderedProviders.map(async (p) => {
                const release = await semaphore();
                try {
                    await Promise.race([
                        enrichProvider(p.id as string, { trade, cacheVersion }),
                        new Promise<void>((_, reject) =>
                            setTimeout(
                                () => reject(new Error('Job timeout')),
                                JOB_TIMEOUT_MS
                            )
                        ),
                    ]);
                } catch {
                    // Individual job failures are non-fatal.
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
