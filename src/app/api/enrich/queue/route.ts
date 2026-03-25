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
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { enrichProvider } from '@/lib/provider-enrichment';
import { toGooglePlaceId } from '@/app/api/providers/persistence';

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
    try {
        const body = await req.json().catch(() => null) as {
            placeIds?: unknown;
            trade?: unknown;
        } | null;

        if (!body || !Array.isArray(body.placeIds) || body.placeIds.length === 0) {
            return NextResponse.json({ error: 'placeIds array required' }, { status: 400 });
        }

        const placeIds = (body.placeIds as string[])
            .filter((id) => typeof id === 'string' && id.trim())
            .map((id) => toGooglePlaceId(id.trim()))
            .slice(0, MAX_PLACE_IDS);

        const trade = typeof body.trade === 'string' && body.trade.trim()
            ? body.trade.trim()
            : undefined;

        // Resolve Google Place IDs → internal provider UUIDs
        const admin = await createSupabaseAdminClient();
        const { data: providers } = await admin
            .from('providers')
            .select('id, google_place_id')
            .in('google_place_id', placeIds);

        if (!providers || providers.length === 0) {
            return NextResponse.json({ queued: 0, processed: 0 });
        }

        const semaphore = createSemaphore(MAX_CONCURRENT);

        await Promise.all(
            providers.map(async (p) => {
                const release = await semaphore();
                try {
                    await Promise.race([
                        enrichProvider(p.id as string, { trade }),
                        new Promise<void>((_, reject) =>
                            setTimeout(
                                () => reject(new Error('Job timeout')),
                                JOB_TIMEOUT_MS
                            )
                        ),
                    ]);
                } catch {
                    // Individual job failures are non-fatal
                } finally {
                    release();
                }
            })
        );

        return NextResponse.json({ queued: providers.length, processed: providers.length });
    } catch (err) {
        console.error('[enrich/queue] Unhandled error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
