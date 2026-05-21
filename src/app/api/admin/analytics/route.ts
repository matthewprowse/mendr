// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';


function getCutoff(period: string | null): Date {
    const cutoff = new Date();
    if (period === '30d') {
        cutoff.setDate(cutoff.getDate() - 30);
        cutoff.setHours(0, 0, 0, 0);
    } else if (period === '7d') {
        cutoff.setDate(cutoff.getDate() - 7);
        cutoff.setHours(0, 0, 0, 0);
    } else {
        // today only
        cutoff.setHours(0, 0, 0, 0);
    }
    return cutoff;
}

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period');
    const cutoff = getCutoff(period);

    // 30d can have more events — raise limit accordingly
    const limit = period === '30d' ? 20000 : 5000;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('diagnosis_events')
        .select('id, session_id, event_type, provider_id, diagnosis_id, created_at')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body?.event_type === 'string')                           patch.event_type  = body.event_type;
    if (typeof body?.provider_id  === 'string' || body?.provider_id  === null) patch.provider_id  = body.provider_id;
    if (typeof body?.diagnosis_id === 'string' || body?.diagnosis_id === null) patch.diagnosis_id = body.diagnosis_id;
    if (typeof body?.session_id   === 'string')                        patch.session_id  = body.session_id;

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('diagnosis_events').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
