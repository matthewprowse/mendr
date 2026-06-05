/**
 * GET  /api/pro/members — the Pro team roster (Phase 8).
 * POST /api/pro/members — invite a teammate by email (owner / admin only).
 *
 * Invites link to an existing Supabase account immediately when one matches the
 * email; otherwise the row waits as `invited` and is activated by the
 * on-signup trigger when that email registers.
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type MemberRow = {
    id: string;
    user_id: string | null;
    role: ProviderRole;
    invited_email: string | null;
    status: 'invited' | 'active' | 'removed';
    created_at: string;
};

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_members')
        .select('id, user_id, role, invited_email, status, created_at')
        .eq('provider_id', ctx.providerId)
        .neq('status', 'removed')
        .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as MemberRow[];
    const userIds = rows.map((r) => r.user_id).filter((v): v is string => Boolean(v));
    const names = new Map<string, string>();
    if (userIds.length > 0) {
        const { data: profiles } = await admin
            .from('profiles')
            .select('user_id, first_name, surname')
            .in('user_id', userIds);
        for (const p of (profiles ?? []) as {
            user_id: string;
            first_name: string | null;
            surname: string | null;
        }[]) {
            const name = [p.first_name, p.surname].filter(Boolean).join(' ').trim();
            if (name) names.set(p.user_id, name);
        }
    }

    const members = rows.map((r) => ({
        id: r.id,
        role: r.role,
        status: r.status,
        isYou: r.user_id === ctx.userId,
        name: (r.user_id && names.get(r.user_id)) || r.invited_email || 'Pending',
        email: r.invited_email,
        createdAt: r.created_at,
    }));

    return NextResponse.json({ members, role: ctx.role });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;
    if (ctx.role !== 'owner' && ctx.role !== 'admin') {
        return NextResponse.json(
            { error: 'Only owners and admins can invite.' },
            { status: 403 },
        );
    }

    const body = (await req.json().catch(() => ({}))) as { email?: unknown; role?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }
    const role: ProviderRole = body.role === 'admin' ? 'admin' : 'member';

    const admin = await createSupabaseAdminClient();

    // Already a member (by email or by linked account)?
    const { data: rpcUserId } = await admin.rpc('get_user_id_by_email', { p_email: email });
    const existingUserId = (rpcUserId as string | null) ?? null;

    const { data: dupe } = await admin
        .from('provider_members')
        .select('id, status')
        .eq('provider_id', ctx.providerId)
        .neq('status', 'removed')
        .or(`invited_email.eq.${email}${existingUserId ? `,user_id.eq.${existingUserId}` : ''}`)
        .limit(1);
    if (dupe && dupe.length > 0) {
        return NextResponse.json(
            { error: 'That person is already on the team.' },
            { status: 409 },
        );
    }

    const now = new Date().toISOString();
    const insert = {
        provider_id: ctx.providerId,
        user_id: existingUserId,
        role,
        invited_email: email,
        invited_by: ctx.userId,
        status: existingUserId ? 'active' : 'invited',
        accepted_at: existingUserId ? now : null,
    };
    const { data, error } = await admin
        .from('provider_members')
        .insert(insert)
        .select('id, status')
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ member: data, linked: Boolean(existingUserId) });
}
