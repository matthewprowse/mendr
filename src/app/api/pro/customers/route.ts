/**
 * GET  /api/pro/customers — list the Pro's customers (Phase 5).
 * POST /api/pro/customers — manually add a customer (walk-in / off-platform).
 *
 * Scoped to the provider the signed-in Pro has claimed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

async function resolve(): Promise<{ userId: string; providerId: string } | NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    return { userId: user.id, providerId };
}

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_customers')
        .select('id, name, phone, email, address, created_at')
        .eq('provider_id', ctx.providerId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ customers: data ?? [] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const field = (k: string) =>
        typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, 200) || null : null;
    const name = field('name');
    if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_customers')
        .insert({
            provider_id: ctx.providerId,
            name,
            phone: field('phone'),
            email: field('email'),
            address: field('address'),
        })
        .select('id, name, phone, email, address, created_at')
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ customer: data });
}
