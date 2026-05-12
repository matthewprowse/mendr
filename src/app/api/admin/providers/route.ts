// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin-auth';


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
        'founded_year',
        'website',
        'whatsapp_available',
        'registration_number',
        'certifications',
        'highlights',
        'referral',
        'team_size',
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
