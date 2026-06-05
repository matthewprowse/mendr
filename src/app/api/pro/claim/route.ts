/**
 * POST /api/pro/claim — submit a claim on an unclaimed provider listing (Phase 4).
 *
 * Does NOT claim directly. It records a pending row in `provider_claims`; an
 * admin reviews and approves it (which is when `providers.claimed_by_user_id` is
 * set). This is the manual ownership-verification step.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { providerId?: unknown };
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
    if (!providerId || !UUID_RE.test(providerId)) {
        return NextResponse.json({ error: 'A valid providerId is required.' }, { status: 400 });
    }

    // Already running a business on Mendr.
    const existing = await getClaimedProviderId(user.id);
    if (existing) {
        return NextResponse.json({ error: 'You have already claimed a business.' }, { status: 409 });
    }

    const admin = await createSupabaseAdminClient();

    // One pending claim per user.
    const { data: ownPending } = await admin
        .from('provider_claims')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .limit(1);
    if (ownPending && ownPending.length > 0) {
        return NextResponse.json(
            { error: 'You already have a claim under review.' },
            { status: 409 }
        );
    }

    const { data: provider } = await admin
        .from('providers')
        .select('id, claimed_by_user_id, merged_into')
        .eq('id', providerId)
        .maybeSingle();
    const p = provider as
        | { id: string; claimed_by_user_id: string | null; merged_into: string | null }
        | null;
    if (!p || p.merged_into) {
        return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
    }
    if (p.claimed_by_user_id) {
        return NextResponse.json(
            { error: 'This business has already been claimed.' },
            { status: 409 }
        );
    }

    // One pending claim per provider.
    const { data: providerPending } = await admin
        .from('provider_claims')
        .select('id')
        .eq('provider_id', providerId)
        .eq('status', 'pending')
        .limit(1);
    if (providerPending && providerPending.length > 0) {
        return NextResponse.json(
            { error: 'Someone is already claiming this business.' },
            { status: 409 }
        );
    }

    const { error } = await admin
        .from('provider_claims')
        .insert({ provider_id: providerId, user_id: user.id, status: 'pending' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: 'pending' });
}
