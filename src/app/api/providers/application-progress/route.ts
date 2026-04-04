import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function requestIp(req: NextRequest): string | null {
    const forwarded = req.headers.get('x-forwarded-for') || '';
    const first = forwarded.split(',').map((x) => x.trim()).find(Boolean);
    return first || null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const phone = req.nextUrl.searchParams.get('phone')?.trim() || null;
    const ip = requestIp(req);
    const admin = await createSupabaseAdminClient();

    let query = admin
        .from('provider_applications')
        .select('*')
        .in('status', ['new', 'contacted'])
        .order('created_at', { ascending: false })
        .limit(1);

    if (phone) query = query.eq('phone', phone);
    else if (ip) query = query.ilike('notes', `%ip:${ip}%`);
    else return NextResponse.json({ application: null });

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Failed to check existing application.' }, { status: 500 });
    return NextResponse.json({ application: data?.[0] ?? null });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Missing application id.' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('provider_applications').delete().eq('id', id);
    if (error) return NextResponse.json({ error: 'Failed to delete existing application.' }, { status: 500 });
    return NextResponse.json({ ok: true });
}
