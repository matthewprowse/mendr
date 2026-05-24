// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { checkRateLimit } from '@/lib/rate-limit-config';
import {
    computeFunnelStages,
    FUNNEL_STAGE_DEFS,
    type FunnelStageRaw,
} from '@/lib/admin/funnel-aggregation';

const DEFAULT_WINDOW_DAYS = 30;
// Defensive upper bound on rows pulled from Supabase. The aggregation is
// session-distinct so duplicates are absorbed; this just protects against
// run-away queries on very busy date ranges.
const MAX_ROWS = 50_000;

function parseIsoDate(value: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d;
}

function resolveDateRange(searchParams: URLSearchParams): { from: Date; to: Date } {
    const fromParam = parseIsoDate(searchParams.get('from'));
    const toParam   = parseIsoDate(searchParams.get('to'));

    const to = toParam ?? new Date();
    const from = fromParam ?? (() => {
        const d = new Date(to);
        d.setDate(d.getDate() - DEFAULT_WINDOW_DAYS);
        return d;
    })();

    // Guard: if caller passed from > to, swap them rather than returning nothing.
    if (from.getTime() > to.getTime()) {
        return { from: to, to: from };
    }
    return { from, to };
}

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    // Reuse an existing bucket — `enrichGet` is the cheap-Supabase-read bucket
    // (60/min). No new buckets are added by this route per the Day 17 brief.
    const limited = await checkRateLimit(req, 'enrichGet');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const { from, to } = resolveDateRange(searchParams);

    const admin = await createSupabaseAdminClient();
    const stageKeys = FUNNEL_STAGE_DEFS.map((d) => d.key);

    const { data, error } = await admin
        .from('diagnosis_events')
        .select('event_type, session_id')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .in('event_type', stageKeys)
        .limit(MAX_ROWS);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: FunnelStageRaw[] = (data ?? []).map((r) => ({
        event_type: String(r.event_type ?? ''),
        session_id: String(r.session_id ?? ''),
    }));

    const { stages, totalSessions } = computeFunnelStages(rows);

    return NextResponse.json({
        from: from.toISOString(),
        to:   to.toISOString(),
        stages,
        totalSessions,
    });
}
