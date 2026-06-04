// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD
//
// AI cost summary for the admin AI Cost tab: month-to-date and last-month
// totals, per-model and per-endpoint breakdowns, cost/calls per diagnosis, and
// a run-rate projection. Built on the existing ai_cost_events table.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { summarizeAiCosts, type AiCostEvent } from '@/lib/admin/ai-cost-summary';

const MAX_ROWS = 100_000;

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const limited = await checkRateLimit(req, 'enrichGet');
    if (limited) return limited;

    const now = new Date();
    // Fetch from the start of the previous month so we can show MTD vs last month.
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('ai_cost_events')
        .select(
            'created_at, estimated_usd, total_tokens, cached_tokens, model_name, endpoint, conversation_id',
        )
        .gte('created_at', lastMonthStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = (data ?? []) as AiCostEvent[];
    const summary = summarizeAiCosts(events, now);

    return NextResponse.json({ generatedAt: now.toISOString(), ...summary });
}
