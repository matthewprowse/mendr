// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD
//
// Durable diagnosis funnel (Phase 4). Computes a per-diagnosis funnel from
// durable server-written state (diagnosis_funnel) joined to diagnoses, replacing
// the old session-based diagnosis_events funnel that stopped producing data on
// 2026-04-26. The cohort is clamped to the instrumented era (tracking_since =
// the earliest diagnosis_funnel row) so pre-instrumentation diagnoses don't
// appear as a false drop-off.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { computeDurableFunnel, type DurableFunnelRow } from '@/lib/admin/durable-funnel';

const DEFAULT_WINDOW_DAYS = 30;
const MAX_ROWS = 20_000;

function parseIsoDate(value: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function resolveDateRange(searchParams: URLSearchParams): { from: Date; to: Date } {
    const fromParam = parseIsoDate(searchParams.get('from'));
    const toParam = parseIsoDate(searchParams.get('to'));

    const to = toParam ?? new Date();
    const from =
        fromParam ??
        (() => {
            const d = new Date(to);
            d.setDate(d.getDate() - DEFAULT_WINDOW_DAYS);
            return d;
        })();

    if (from.getTime() > to.getTime()) return { from: to, to: from };
    return { from, to };
}

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const limited = await checkRateLimit(req, 'enrichGet');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const { from, to } = resolveDateRange(searchParams);

    const admin = await createSupabaseAdminClient();

    // Clamp the cohort to the instrumented era so pre-go-live diagnoses (which
    // have no funnel row) don't show up as a false Started → Delivered drop.
    const { data: trackingRow } = await admin
        .from('diagnosis_funnel')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    const trackingSince =
        trackingRow?.created_at ? new Date(trackingRow.created_at as string) : null;
    const effectiveFrom =
        trackingSince && trackingSince.getTime() > from.getTime() ? trackingSince : from;

    const { data, error } = await admin
        .from('diagnoses')
        .select(
            'created_at, diagnosis, diagnosis_funnel(delivered_at, matches_shown_at, first_contact_at)',
        )
        .gte('created_at', effectiveFrom.toISOString())
        .lte('created_at', to.toISOString())
        .limit(MAX_ROWS);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: DurableFunnelRow[] = (data ?? []).map((r) => {
        const row = r as {
            created_at: string;
            diagnosis: unknown;
            diagnosis_funnel:
                | { delivered_at: string | null; matches_shown_at: string | null; first_contact_at: string | null }
                | Array<{ delivered_at: string | null; matches_shown_at: string | null; first_contact_at: string | null }>
                | null;
        };
        const fk = row.diagnosis_funnel;
        const f = Array.isArray(fk) ? fk[0] ?? null : fk ?? null;
        const diag = row.diagnosis as { trade?: unknown } | null;
        const trade =
            diag && typeof diag === 'object' && typeof diag.trade === 'string' ? diag.trade : null;
        return {
            created_at: String(row.created_at),
            trade,
            delivered_at: f?.delivered_at ?? null,
            matches_shown_at: f?.matches_shown_at ?? null,
            first_contact_at: f?.first_contact_at ?? null,
        };
    });

    const result = computeDurableFunnel(rows);

    return NextResponse.json({
        from: effectiveFrom.toISOString(),
        to: to.toISOString(),
        requestedFrom: from.toISOString(),
        trackingSince: trackingSince ? trackingSince.toISOString() : null,
        ...result,
    });
}
