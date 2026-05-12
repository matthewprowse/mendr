// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD
//
// Returns daily AI cost totals from the ai_cost_events table.
// Query params:
//   ?days=7   — look-back window in days (default 7, max 90)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getAiCostDailyTotals } from '@/lib/ai-cost-logger';

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const rawDays = parseInt(searchParams.get('days') ?? '7', 10);
    const days = Math.min(90, Math.max(1, isNaN(rawDays) ? 7 : rawDays));

    const rows = await getAiCostDailyTotals(days);
    return NextResponse.json(rows);
}
