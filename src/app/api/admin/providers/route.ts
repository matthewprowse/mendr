// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';

// GET — list all provider applications, newest first.
export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_applications')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// POST — create a provider application manually from the admin directory.
// Mirrors the public apply flow but skips the confirmation email; the row lands
// as a normal 'new' application that can then be processed/enriched.
export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = await req.json().catch(() => null);
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

    const business_name = str(body?.business_name);
    const contact_name = str(body?.contact_name);
    const email = str(body?.email);
    const phone = str(body?.phone);
    const address = str(body?.address);
    const trade = str(body?.trade);

    const missing = Object.entries({
        business_name,
        contact_name,
        email,
        phone,
        address,
        trade,
    })
        .filter(([, v]) => !v)
        .map(([k]) => k);
    if (missing.length > 0) {
        return NextResponse.json(
            { error: `Missing required fields: ${missing.join(', ')}` },
            { status: 400 },
        );
    }

    const row: Record<string, unknown> = {
        business_name,
        contact_name,
        email,
        phone,
        address,
        trade,
        trade_description: str(body?.trade_description),
        areas: str(body?.areas),
        website: str(body?.website) || null,
        registration_number: str(body?.registration_number) || null,
        certifications: str(body?.certifications) || null,
        highlights: str(body?.highlights) || null,
        referral: str(body?.referral) || null,
        notes: str(body?.notes) || null,
        whatsapp_available: Boolean(body?.whatsapp_available),
        status: 'new',
        source: 'admin_manual',
    };

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_applications')
        .insert(row)
        .select('id')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id ?? null }, { status: 201 });
}

// PATCH — update status, notes, or sendgrid_sent_at on a single record.
export async function PATCH(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const allowed = [
        'status',
        'notes',
        'sendgrid_sent_at',
        'contact_name',
        'business_name',
        'trade',
        'trade_description',
        'phone',
        'email',
        'address',
        'areas',
        'website',
        'whatsapp_available',
        'registration_number',
        'certifications',
        'highlights',
        'referral',
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
        if (key in body) patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('provider_applications').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
