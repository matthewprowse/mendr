// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
//
// Monthly AI budget, stored in admin_settings under 'ai_monthly_budget_usd'.
// Display and alerting only — it never throttles AI calls. GET returns the
// current value; POST sets it (number) or clears it (null).

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';

const SETTING_KEY = 'ai_monthly_budget_usd';

function parseAmount(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('admin_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ monthlyBudgetUsd: parseAmount(data?.value) });
}

export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = (await req.json().catch(() => null)) as { amount?: unknown } | null;
    const raw = body?.amount;
    // Allow null to clear the budget; otherwise require a non-negative number.
    if (raw !== null && parseAmount(raw) === null) {
        return NextResponse.json(
            { error: 'amount must be a non-negative number or null' },
            { status: 400 },
        );
    }
    const amount = raw === null ? null : parseAmount(raw);

    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('admin_settings')
        .upsert(
            { key: SETTING_KEY, value: amount, updated_at: new Date().toISOString() },
            { onConflict: 'key' },
        );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ monthlyBudgetUsd: amount });
}
