// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';


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

export async function DELETE(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const id = (searchParams.get('id') ?? '').trim();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = await createSupabaseAdminClient();

    // Look up the storage location first so we can remove the underlying file too.
    const { data: row } = await admin
        .from('provider_images')
        .select('bucket, path')
        .eq('id', id)
        .maybeSingle();

    const { error } = await admin.from('provider_images').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort storage cleanup — never fails the request.
    const bucket = typeof row?.bucket === 'string' ? row.bucket.trim() : '';
    const path = typeof row?.path === 'string' ? row.path.trim().replace(/^\/+/, '') : '';
    if (bucket && path) {
        try {
            await admin.storage.from(bucket).remove([path]);
        } catch {
            // ignore storage cleanup errors
        }
    }

    return NextResponse.json({ ok: true });
}
