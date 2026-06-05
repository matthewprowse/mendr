// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

/**
 * Resume / delete the caller's own in-progress application (wizard draft).
 *
 * Finding C6: this used to look an application up (and delete it) by a
 * client-supplied phone or a spoofable x-forwarded-for IP, returning the full
 * PII row to anyone who guessed a phone, and the IP branch interpolated the raw
 * IP into an `or` filter string. Retrieval and deletion are now keyed strictly
 * on the authenticated session user_id. Anonymous callers get nothing.
 */
async function sessionUserId(): Promise<string | null> {
    try {
        const client = await createSupabaseServerClient();
        const {
            data: { user },
        } = await client.auth.getUser();
        return user?.id ?? null;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'applicationEdit');
    if (limited) return limited;

    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ application: null });

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_applications')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['new', 'contacted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return NextResponse.json({ error: 'Failed to check existing application.' }, { status: 500 });
    return NextResponse.json({ application: data ?? null });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'applicationEdit');
    if (limited) return limited;

    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Missing application id.' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_applications')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id');

    if (error) return NextResponse.json({ error: 'Failed to delete existing application.' }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
