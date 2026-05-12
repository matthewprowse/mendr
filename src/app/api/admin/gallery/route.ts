import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin-auth';


export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const admin = await createSupabaseAdminClient();
    // Admin needs the full queue (especially older `pending` rows). PostgREST/server may still cap rows.
    const { data, error } = await admin
        .from('provider_images')
        .select('id, created_at, provider_id, bucket, path, caption, source, sort_order, status, providers(name)')
        .order('created_at', { ascending: false })
        .range(0, 9999);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const status = typeof body?.status === 'string' ? body.status.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (status) {
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }
        patch.status = status;
    }
    if (typeof body?.caption === 'string') patch.caption = body.caption;
    if (typeof body?.source === 'string') patch.source = body.source;
    if (typeof body?.sort_order === 'number') patch.sort_order = body.sort_order;
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('provider_images')
        .update(patch)
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
