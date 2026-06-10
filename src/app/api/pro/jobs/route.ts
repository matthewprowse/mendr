/**
 * GET  /api/pro/jobs — list the Pro's jobs (Phase 5b).
 * POST /api/pro/jobs — create a job manually.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

async function resolve(): Promise<{ providerId: string } | NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    return { providerId };
}

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('jobs')
        .select('id, title, site_address, status, scheduled_for, created_at, provider_customers(name)')
        .eq('provider_id', ctx.providerId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
    const siteAddress =
        typeof body.site_address === 'string' ? body.site_address.trim().slice(0, 300) || null : null;
    const scheduledFor =
        typeof body.scheduled_for === 'string' && body.scheduled_for ? body.scheduled_for : null;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('jobs')
        .insert({
            provider_id: ctx.providerId,
            title,
            site_address: siteAddress,
            scheduled_for: scheduledFor,
        })
        .select('id, title, site_address, status, scheduled_for, created_at')
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ job: data });
}
