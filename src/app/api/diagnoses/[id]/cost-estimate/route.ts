/* eslint-disable no-console */
// Lazy generate-and-store cost estimate for a diagnosis.
//
// GET /api/diagnoses/[id]/cost-estimate
//   • Returns the stored estimate if one was already generated (stored, not
//     regenerated per view, so the diagnosis page and report always agree).
//   • Otherwise generates one cheap gemini-2.5-flash estimate, stores it onto
//     the diagnosis JSON, and returns it.
//   • Returns { estimate: null } (HTTP 200) for anything without a real
//     diagnosis (rejected / unserviced / clarification) or on any failure, so a
//     problem here never breaks the page — the card just hides.
//
// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GEMINI_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { generateCostEstimate, type CostEstimate } from '@/lib/cost/estimate-cost';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

type DiagnosisJson = Record<string, unknown> & {
    diagnosis?: string;
    message?: string;
    thinking?: string;
    trade?: string;
    failed_component?: string;
    rejected?: boolean;
    unserviced?: boolean;
    requires_clarification?: boolean;
    cost_estimate?: CostEstimate;
};

function noEstimate() {
    return NextResponse.json({ estimate: null }, { status: 200 });
}

export async function GET(req: NextRequest, context: RouteContext) {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid diagnosis id.' }, { status: 400 });
    }

    const limited = await checkRateLimit(req, 'costEstimate');
    if (limited) return limited;

    if (!process.env.GEMINI_API_KEY) return noEstimate();

    let admin;
    try {
        admin = await createSupabaseAdminClient();
    } catch {
        return noEstimate();
    }

    const { data: row, error } = await admin
        .from('diagnoses')
        .select('id, diagnosis')
        .eq('id', id)
        .maybeSingle();

    if (error || !row?.diagnosis) return noEstimate();

    const diag = row.diagnosis as DiagnosisJson;

    // Already generated — return the stored copy (stored, not per-view).
    if (diag.cost_estimate && Array.isArray(diag.cost_estimate.line_items)) {
        return NextResponse.json({ estimate: diag.cost_estimate });
    }

    // No estimate for non-diagnoses (rejected / unserviced / clarification) or empties.
    const title = typeof diag.diagnosis === 'string' ? diag.diagnosis.trim() : '';
    if (!title || diag.rejected || diag.unserviced || diag.requires_clarification) {
        return noEstimate();
    }

    const detail =
        (typeof diag.message === 'string' && diag.message) ||
        (typeof diag.thinking === 'string' ? diag.thinking : '');

    const estimate = await generateCostEstimate({
        conversationId: id,
        title,
        detail,
        trade: typeof diag.trade === 'string' ? diag.trade : null,
        failedComponent: typeof diag.failed_component === 'string' ? diag.failed_component : null,
    });

    if (!estimate) return noEstimate();

    // Persist onto the diagnosis JSON (best-effort) so later views and the
    // report reuse it instead of paying for another generation.
    try {
        await admin
            .from('diagnoses')
            .update({ diagnosis: { ...diag, cost_estimate: estimate } })
            .eq('id', id);
    } catch (e) {
        console.warn('[cost-estimate] persist failed', e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ estimate });
}
