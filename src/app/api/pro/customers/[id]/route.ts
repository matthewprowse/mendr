/**
 * PATCH /api/pro/customers/[id] — edit a customer (Phase 5). Scoped to the
 * provider the signed-in Pro has claimed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id } = await ctx.params;
    if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, string | null> = {};
    for (const key of ['name', 'phone', 'email', 'address']) {
        if (body[key] !== undefined) {
            patch[key] =
                typeof body[key] === 'string'
                    ? (body[key] as string).trim().slice(0, 200) || null
                    : null;
        }
    }
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();

    const { data: customer } = await admin
        .from('provider_customers')
        .select('provider_id')
        .eq('id', id)
        .maybeSingle();
    if (!customer || (customer as { provider_id: string }).provider_id !== providerId) {
        return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    }

    const { error } = await admin
        .from('provider_customers')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
