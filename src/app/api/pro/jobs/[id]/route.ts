/**
 * PATCH /api/pro/jobs/[id] — update a job (Phase 5b). Scoped to the provider the
 * signed-in Pro has claimed. Marking a job completed stamps completed_at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id } = await ctx.params;
    if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200);
    if (body.site_address !== undefined) {
        patch.site_address =
            typeof body.site_address === 'string'
                ? body.site_address.trim().slice(0, 300) || null
                : null;
    }
    if (body.scheduled_for !== undefined) {
        patch.scheduled_for =
            typeof body.scheduled_for === 'string' && body.scheduled_for ? body.scheduled_for : null;
    }
    if (body.status !== undefined) {
        if (
            typeof body.status !== 'string' ||
            !STATUSES.includes(body.status as (typeof STATUSES)[number])
        ) {
            return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
        }
        patch.status = body.status;
        patch.completed_at = body.status === 'completed' ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }
    patch.updated_at = new Date().toISOString();

    const admin = await createSupabaseAdminClient();
    const { data: job } = await admin
        .from('jobs')
        .select('provider_id')
        .eq('id', id)
        .maybeSingle();
    if (!job || (job as { provider_id: string }).provider_id !== providerId) {
        return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const { error } = await admin.from('jobs').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
