/**
 * PATCH /api/pro/leads/[id] — update a lead's pipeline status (Phase 4).
 *
 * `id` is the provider_contact_events id. Authorises that the event belongs to a
 * provider the signed-in Pro has claimed, then upserts `lead_states`.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

const STATUSES = ['new', 'responded', 'quoted', 'won', 'lost'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id } = await ctx.params;
    if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid lead id.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { status?: unknown };
    const status = body.status;
    if (typeof status !== 'string' || !STATUSES.includes(status as (typeof STATUSES)[number])) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });

    const admin = await createSupabaseAdminClient();

    // The lead must belong to a provider this Pro has claimed.
    const { data: event } = await admin
        .from('provider_contact_events')
        .select('provider_id')
        .eq('id', id)
        .maybeSingle();
    if (!event || (event as { provider_id: string }).provider_id !== providerId) {
        return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const { error } = await admin
        .from('lead_states')
        .upsert(
            { contact_event_id: id, status, updated_at: new Date().toISOString() },
            { onConflict: 'contact_event_id' }
        );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, status });
}
