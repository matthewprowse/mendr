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

    const body = (await req.json().catch(() => ({}))) as { status?: unknown; notes?: unknown };

    const patch: { status?: string; notes?: string | null } = {};
    if (body.status !== undefined) {
        if (
            typeof body.status !== 'string' ||
            !STATUSES.includes(body.status as (typeof STATUSES)[number])
        ) {
            return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
        }
        patch.status = body.status;
    }
    if (body.notes !== undefined) {
        if (typeof body.notes !== 'string') {
            return NextResponse.json({ error: 'Invalid notes.' }, { status: 400 });
        }
        patch.notes = body.notes.trim().slice(0, 2000) || null;
    }
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
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
            { contact_event_id: id, ...patch, updated_at: new Date().toISOString() },
            { onConflict: 'contact_event_id' }
        );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // A won lead becomes a job (best-effort, idempotent on the lead).
    if (patch.status === 'won') {
        try {
            type DiagRef = {
                title: string | null;
                customer_address: string | null;
                user_id: string | null;
            };
            const { data: ev } = await admin
                .from('provider_contact_events')
                .select('diagnoses(title, customer_address, user_id)')
                .eq('id', id)
                .maybeSingle();
            const raw = (ev as { diagnoses: DiagRef | DiagRef[] | null } | null)?.diagnoses ?? null;
            const diag = Array.isArray(raw) ? raw[0] : raw;

            let customerId: string | null = null;
            if (diag?.user_id) {
                const { data: cust } = await admin
                    .from('provider_customers')
                    .select('id')
                    .eq('provider_id', providerId)
                    .eq('homeowner_user_id', diag.user_id)
                    .maybeSingle();
                customerId = (cust as { id: string } | null)?.id ?? null;
            }

            const addr = diag?.customer_address ?? null;
            const suburb = addr
                ? (addr.split(',').map((p) => p.trim()).filter(Boolean)[1] ?? null)
                : null;

            await admin.from('jobs').upsert(
                {
                    provider_id: providerId,
                    contact_event_id: id,
                    customer_id: customerId,
                    title: diag?.title ?? 'Job',
                    site_address: suburb,
                },
                { onConflict: 'contact_event_id', ignoreDuplicates: true }
            );
        } catch (e) {
            console.warn('[pro/leads] job creation skipped:', e);
        }
    }

    return NextResponse.json({ ok: true, ...patch });
}
