import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function checkAdminCookie(req: NextRequest): boolean {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;
    const session = req.cookies.get('admin_session')?.value;
    return session === Buffer.from(password).toString('base64');
}

export async function GET(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_images')
        .select('id, created_at, provider_id, bucket, path, caption, source, sort_order, status, providers(name)')
        .order('created_at', { ascending: false })
        .limit(300);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const status = typeof body?.status === 'string' ? body.status.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) {
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }
        patch.status = status;
    }
    if (typeof body?.caption === 'string') patch.caption = body.caption;
    if (typeof body?.source === 'string') patch.source = body.source;
    if (typeof body?.sort_order === 'number') patch.sort_order = body.sort_order;
    if (Object.keys(patch).length === 1) {
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
