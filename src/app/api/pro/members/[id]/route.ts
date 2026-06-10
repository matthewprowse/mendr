/**
 * PATCH  /api/pro/members/[id] — change a teammate's role (owner only).
 * DELETE /api/pro/members/[id] — remove a teammate (owner, or admin removing a
 *        plain member). The owner row is immutable here.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolve(
    id: string,
): Promise<{ providerId: string; userId: string; role: ProviderRole } | NextResponse> {
    if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid member id.' }, { status: 400 });
    }
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

type TargetRow = { provider_id: string; role: ProviderRole; status: string };

async function loadTarget(id: string, providerId: string): Promise<TargetRow | NextResponse> {
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('provider_members')
        .select('provider_id, role, status')
        .eq('id', id)
        .maybeSingle();
    const row = data as TargetRow | null;
    if (!row || row.provider_id !== providerId || row.status === 'removed') {
        return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }
    return row;
}

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const { id } = await ctx.params;
    const r = await resolve(id);
    if (r instanceof NextResponse) return r;
    if (r.role !== 'owner') {
        return NextResponse.json(
            { error: 'Only the owner can change roles.' },
            { status: 403 },
        );
    }

    const target = await loadTarget(id, r.providerId);
    if (target instanceof NextResponse) return target;
    if (target.role === 'owner') {
        return NextResponse.json(
            { error: 'The owner role cannot be changed here.' },
            { status: 409 },
        );
    }

    const body = (await req.json().catch(() => ({}))) as { role?: unknown };
    const role: ProviderRole = body.role === 'admin' ? 'admin' : 'member';

    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('provider_members')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, role });
}

export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const { id } = await ctx.params;
    const r = await resolve(id);
    if (r instanceof NextResponse) return r;
    if (r.role !== 'owner' && r.role !== 'admin') {
        return NextResponse.json(
            { error: 'Only owners and admins can remove teammates.' },
            { status: 403 },
        );
    }

    const target = await loadTarget(id, r.providerId);
    if (target instanceof NextResponse) return target;
    if (target.role === 'owner') {
        return NextResponse.json({ error: 'The owner cannot be removed.' }, { status: 409 });
    }
    if (r.role === 'admin' && target.role === 'admin') {
        return NextResponse.json(
            { error: 'Only the owner can remove an admin.' },
            { status: 403 },
        );
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('provider_members')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
