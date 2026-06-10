/**
 * Pro-facing gallery management for the claimed provider's own images.
 *
 * DELETE /api/pro/gallery?id=<imageId> — remove one of the Pro's images.
 * PATCH  /api/pro/gallery { id, caption?, sort_order? } — edit caption / order.
 *
 * The provider is resolved from the session (not a URL id) so a Pro can only
 * touch their own rows, and moderation status is never changed here (that stays
 * admin-only via /api/admin/gallery). Uploads still go through the existing
 * owner-gated POST /api/providers/[id]/gallery.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getClaimedProviderId, getProviderRole } from '@/lib/providers/claimed-provider';

async function resolve(): Promise<{ providerId: string } | NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId)
        return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    const role = await getProviderRole(user.id, providerId);
    if (role !== 'owner' && role !== 'admin')
        return NextResponse.json(
            { error: 'Only owners and admins can manage photos.' },
            { status: 403 },
        );
    return { providerId };
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const id = (new URL(req.url).searchParams.get('id') ?? '').trim();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { data: row } = await admin
        .from('provider_images')
        .select('provider_id, bucket, path')
        .eq('id', id)
        .maybeSingle();

    const r = row as { provider_id: string; bucket: string | null; path: string | null } | null;
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (r.provider_id !== ctx.providerId)
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await admin.from('provider_images').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort storage cleanup — never fails the request.
    const bucket = typeof r.bucket === 'string' ? r.bucket.trim() : '';
    const path = typeof r.path === 'string' ? r.path.trim().replace(/^\/+/, '') : '';
    if (bucket && path) {
        try {
            await admin.storage.from(bucket).remove([path]);
        } catch {
            // ignore storage cleanup errors
        }
    }

    return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body?.caption === 'string') patch.caption = body.caption.slice(0, 200);
    if (typeof body?.sort_order === 'number') patch.sort_order = body.sort_order;
    if (Object.keys(patch).length === 0)
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { data: row } = await admin
        .from('provider_images')
        .select('provider_id')
        .eq('id', id)
        .maybeSingle();

    const r = row as { provider_id: string } | null;
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (r.provider_id !== ctx.providerId)
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await admin.from('provider_images').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
