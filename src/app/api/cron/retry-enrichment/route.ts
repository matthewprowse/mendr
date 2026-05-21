// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { enrichProvider } from '@/lib/providers/provider-enrichment';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FAILED_RETRY_MS = 48 * 60 * 60 * 1000;
const LOW_QUALITY_RETRY_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 15;

/**
 * Daily cron: re-run full enrichment for providers whose cache row is failed/low-quality
 * and past the same cooling windows as provider-enrichment.ts.
 */
export async function GET(req: NextRequest) {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const failedCutoff = new Date(Date.now() - FAILED_RETRY_MS).toISOString();
    const lowCutoff = new Date(Date.now() - LOW_QUALITY_RETRY_MS).toISOString();

    try {
        const admin = await createSupabaseAdminClient();

        const { data: failedRows, error: failedErr } = await admin
            .from('provider_cache')
            .select('provider_id, updated_at')
            .eq('scrape_status', 'failed')
            .lt('updated_at', failedCutoff)
            .not('provider_id', 'is', null)
            .limit(MAX_JOBS);

        if (failedErr) {
            return NextResponse.json({ error: failedErr.message }, { status: 500 });
        }

        const { data: lowRows, error: lowErr } = await admin
            .from('provider_cache')
            .select('provider_id, updated_at')
            .eq('enrichment_quality', 'low')
            .lt('updated_at', lowCutoff)
            .not('provider_id', 'is', null)
            .limit(MAX_JOBS);

        if (lowErr) {
            return NextResponse.json({ error: lowErr.message }, { status: 500 });
        }

        // Third query: scrape succeeded but AI enrichment never ran (enriched_at IS NULL).
        // These are stuck rows where the scrape completed but the Gemini step failed silently.
        // After the Stage 4 upsert fix, new occurrences will also appear here.
        const { data: stuckRows, error: stuckErr } = await admin
            .from('provider_cache')
            .select('provider_id, updated_at')
            .eq('scrape_status', 'ok')
            .is('enriched_at', null)
            .lt('updated_at', failedCutoff)
            .not('provider_id', 'is', null)
            .limit(MAX_JOBS);

        if (stuckErr) {
            return NextResponse.json({ error: stuckErr.message }, { status: 500 });
        }

        const ids = new Set<string>();
        for (const r of failedRows ?? []) {
            const id = typeof (r as { provider_id?: string }).provider_id === 'string'
                ? (r as { provider_id: string }).provider_id
                : '';
            if (id) ids.add(id);
        }
        for (const r of lowRows ?? []) {
            const id = typeof (r as { provider_id?: string }).provider_id === 'string'
                ? (r as { provider_id: string }).provider_id
                : '';
            if (id) ids.add(id);
        }
        for (const r of stuckRows ?? []) {
            const id = typeof (r as { provider_id?: string }).provider_id === 'string'
                ? (r as { provider_id: string }).provider_id
                : '';
            if (id) ids.add(id);
        }

        const providerIds = [...ids].slice(0, MAX_JOBS);
        const outcomes: { providerId: string; ok: boolean; reason?: string }[] = [];

        for (const providerId of providerIds) {
            const res = await enrichProvider(providerId);
            outcomes.push({
                providerId,
                ok: res.ok,
                reason: res.reason,
            });
        }

        return NextResponse.json({
            ok: true,
            attempted: providerIds.length,
            outcomes,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
