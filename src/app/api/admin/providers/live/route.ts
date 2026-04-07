import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function checkAdminCookie(req: NextRequest): boolean {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;
    const session = req.cookies.get('admin_session')?.value;
    return session === Buffer.from(password).toString('base64');
}

type ProviderPerfRow = {
    provider_id: string;
    event_type: 'match_view' | 'provider_profile_view' | 'provider_contact';
};

export async function GET(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    const [{ data: providers, error: providersError }, { data: perfRows, error: perfError }] = await Promise.all([
        admin
            .from('providers')
            .select('id, name, address, rating, rating_count')
            .order('name', { ascending: true }),
        admin
            .from('diagnosis_events')
            .select('provider_id, event_type')
            .in('event_type', ['match_view', 'provider_profile_view', 'provider_contact'])
            .not('provider_id', 'is', null)
            .limit(100000),
    ]);

    if (providersError) return NextResponse.json({ error: providersError.message }, { status: 500 });
    if (perfError) return NextResponse.json({ error: perfError.message }, { status: 500 });

    const counts = new Map<string, { outputs: number; contacts: number; profileViews: number }>();
    for (const row of (perfRows ?? []) as ProviderPerfRow[]) {
        if (!row.provider_id) continue;
        const bucket = counts.get(row.provider_id) ?? { outputs: 0, contacts: 0, profileViews: 0 };
        if (row.event_type === 'match_view' || row.event_type === 'provider_profile_view') bucket.outputs += 1;
        if (row.event_type === 'provider_profile_view') bucket.profileViews += 1;
        if (row.event_type === 'provider_contact') bucket.contacts += 1;
        counts.set(row.provider_id, bucket);
    }

    const payload = (providers ?? []).map((p: any) => {
        const c = counts.get(String(p.id)) ?? { outputs: 0, contacts: 0, profileViews: 0 };
        return {
            id: String(p.id),
            name: typeof p.name === 'string' ? p.name : 'Unnamed',
            address: typeof p.address === 'string' ? p.address : null,
            rating: typeof p.rating === 'number' ? p.rating : null,
            rating_count: typeof p.rating_count === 'number' ? p.rating_count : 0,
            output_count: c.outputs,
            contact_count: c.contacts,
            profile_view_count: c.profileViews,
            avg_output_position: null as number | null,
        };
    });

    return NextResponse.json(payload);
}

export async function PATCH(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body?.name === 'string') patch.name = body.name;
    if (typeof body?.address === 'string') patch.address = body.address;
    if (typeof body?.rating === 'number') patch.rating = body.rating;
    if (typeof body?.rating_count === 'number') patch.rating_count = body.rating_count;
    if (Object.keys(patch).length === 1) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('providers').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
