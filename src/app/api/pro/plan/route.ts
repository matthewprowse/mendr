/**
 * GET   /api/pro/plan — current plan + usage (seats).
 * PATCH /api/pro/plan — change plan (owner only).
 *
 * NOTE: billing is not built. Changing plan takes no payment and charges
 * nobody; it only adjusts the enforced limits. See the Pro Portal plan doc,
 * Phase 10.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import {
    getClaimedProviderId,
    getProviderRole,
    type ProviderRole,
} from '@/lib/providers/claimed-provider';
import { PLANS, isPlanId, toPlanId, type PlanId } from '@/lib/pro/plans';

async function resolve(): Promise<
    { providerId: string; userId: string; role: ProviderRole } | NextResponse
> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId)
        return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    const role = await getProviderRole(user.id, providerId);
    if (!role) return NextResponse.json({ error: 'Not on this team.' }, { status: 403 });
    return { providerId, userId: user.id, role };
}

async function seatCount(providerId: string): Promise<number> {
    const admin = await createSupabaseAdminClient();
    const { count } = await admin
        .from('provider_members')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId)
        .neq('status', 'removed');
    return count ?? 0;
}

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('providers')
        .select('plan')
        .eq('id', ctx.providerId)
        .maybeSingle();
    const plan = toPlanId((data as { plan?: string } | null)?.plan);
    const seats = await seatCount(ctx.providerId);

    return NextResponse.json({ plan, seatsUsed: seats, role: ctx.role });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;
    if (ctx.role !== 'owner') {
        return NextResponse.json(
            { error: 'Only the owner can change the plan.' },
            { status: 403 },
        );
    }

    const body = (await req.json().catch(() => ({}))) as { plan?: unknown };
    if (!isPlanId(body.plan)) {
        return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });
    }
    const target: PlanId = body.plan;

    // Downgrade guard: the team must fit the new seat limit.
    const seats = await seatCount(ctx.providerId);
    if (seats > PLANS[target].limits.maxSeats) {
        return NextResponse.json(
            {
                error: `The ${PLANS[target].name} plan allows ${PLANS[target].limits.maxSeats} seat(s), but your team has ${seats}. Remove teammates first.`,
            },
            { status: 409 },
        );
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('providers')
        .update({ plan: target, updated_at: new Date().toISOString() })
        .eq('id', ctx.providerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, plan: target });
}
