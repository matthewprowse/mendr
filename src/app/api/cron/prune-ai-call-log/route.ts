/* eslint-disable no-console */
/**
 * Cron: prune ai_call_log rows older than the retention window.
 *
 * Runs weekly. Deletes rows with `created_at < now() - 90 days`. Capped at
 * 50,000 rows per run to stay well within the function timeout — multiple
 * runs converge over a few weeks if a backlog ever exists.
 *
 * Trigger via Vercel cron or manually:
 *   GET/POST /api/cron/prune-ai-call-log
 *   GET/POST /api/cron/prune-ai-call-log?dryRun=true
 *
 * Authorization: Bearer <CRON_SECRET>
 *
 * See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 3
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export const maxDuration = 60;

/** Retention window — anything older is eligible for delete. */
const RETENTION_DAYS = 90;
/** Per-run cap to bound function duration. */
const MAX_DELETIONS_PER_RUN = 50_000;

export async function GET(req: NextRequest) {
    return handle(req);
}

export async function POST(req: NextRequest) {
    return handle(req);
}

async function handle(req: NextRequest): Promise<NextResponse> {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';

    try {
        const admin = await createSupabaseAdminClient();
        const cutoffIso = new Date(
            Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();

        // Count first so the response is informative whether or not we delete.
        const { count: candidateCount, error: countErr } = await admin
            .from('ai_call_log')
            .select('id', { count: 'exact', head: true })
            .lt('created_at', cutoffIso);

        if (countErr) {
            console.error('[cron/prune-ai-call-log] count failed', countErr);
            return NextResponse.json({ error: countErr.message }, { status: 500 });
        }

        if (dryRun) {
            return NextResponse.json({
                dryRun: true,
                cutoff: cutoffIso,
                candidateCount: candidateCount ?? 0,
                wouldDelete: Math.min(candidateCount ?? 0, MAX_DELETIONS_PER_RUN),
            });
        }

        // Pull a batch of ids to delete (bounded by MAX_DELETIONS_PER_RUN).
        const { data: rowsToDelete, error: selectErr } = await admin
            .from('ai_call_log')
            .select('id')
            .lt('created_at', cutoffIso)
            .order('created_at', { ascending: true })
            .limit(MAX_DELETIONS_PER_RUN);

        if (selectErr) {
            console.error('[cron/prune-ai-call-log] select failed', selectErr);
            return NextResponse.json({ error: selectErr.message }, { status: 500 });
        }

        const ids = (rowsToDelete ?? []).map((r) => r.id as string);
        if (ids.length === 0) {
            return NextResponse.json({
                cutoff: cutoffIso,
                candidateCount: 0,
                deleted: 0,
            });
        }

        const { error: delErr } = await admin
            .from('ai_call_log')
            .delete()
            .in('id', ids);

        if (delErr) {
            console.error('[cron/prune-ai-call-log] delete failed', delErr);
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }

        console.warn(
            JSON.stringify({
                type: 'cron_ai_call_log_prune',
                cutoff: cutoffIso,
                deleted: ids.length,
                remaining: Math.max(0, (candidateCount ?? 0) - ids.length),
            }),
        );

        return NextResponse.json({
            cutoff: cutoffIso,
            candidateCount: candidateCount ?? 0,
            deleted: ids.length,
        });
    } catch (e) {
        console.error('[cron/prune-ai-call-log] threw', e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'unknown' },
            { status: 500 },
        );
    }
}
