import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function getClientIp(req: NextRequest): string | null {
    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const ip = forwardedFor.split(',')[0]?.trim() || '';
    return ip || null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const ip = getClientIp(req);
    const phone = req.nextUrl.searchParams.get('phone')?.trim() || '';
    const admin = await createSupabaseAdminClient();

    const orFilters: string[] = [];
    if (ip) orFilters.push(`applicant_ip.eq.${ip}`);
    if (phone) orFilters.push(`phone.eq.${phone}`);
    if (orFilters.length === 0) return NextResponse.json({ application: null });

    const { data, error } = await admin
        .from('provider_applications')
        .select('*')
        .or(orFilters.join(','))
        .in('status', ['new', 'contacted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return NextResponse.json({ error: 'Failed to check existing application.' }, { status: 500 });
    return NextResponse.json({ application: data ?? null });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const ip = getClientIp(req);
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Missing application id.' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    let query = admin.from('provider_applications').delete().eq('id', id);
    if (ip) query = query.eq('applicant_ip', ip);
    const { error } = await query;

    if (error) return NextResponse.json({ error: 'Failed to delete existing application.' }, { status: 500 });
    return NextResponse.json({ ok: true });
}
