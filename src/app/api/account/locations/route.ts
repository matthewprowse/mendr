import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';

type SavedLocation = {
    id: string;
    label: string;
    address: string;
    lat?: number | null;
    lng?: number | null;
};

async function getUser() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountLocations');
    if (limited) return limited;

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const admin = await createSupabaseAdminClient();
    const { data: profile, error } = await admin
        .from('profiles')
        .select('locations')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        console.error('[locations GET] error:', error);
        return NextResponse.json({ error: 'Failed to fetch locations.' }, { status: 500 });
    }

    const locations: SavedLocation[] = Array.isArray(profile?.locations) ? profile.locations : [];
    return NextResponse.json({ locations });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountLocations');
    if (limited) return limited;

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    type PostBody = { label?: unknown; address?: unknown; lat?: unknown; lng?: unknown };

    let body: PostBody | null = null;
    try {
        body = (await req.json().catch(() => null)) as PostBody | null;
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    const address = typeof body?.address === 'string' ? body.address.trim() : '';
    const lat = typeof body?.lat === 'number' ? body.lat : null;
    const lng = typeof body?.lng === 'number' ? body.lng : null;

    if (!label || label.length > 50) {
        return NextResponse.json(
            { error: 'Label is required and must be 50 characters or fewer.' },
            { status: 400 }
        );
    }
    if (!address || address.length > 200) {
        return NextResponse.json(
            { error: 'Address is required and must be 200 characters or fewer.' },
            { status: 400 }
        );
    }

    const admin = await createSupabaseAdminClient();
    const { data: profile, error: fetchError } = await admin
        .from('profiles')
        .select('locations')
        .eq('id', user.id)
        .maybeSingle();

    if (fetchError) {
        console.error('[locations POST] fetch error:', fetchError);
        return NextResponse.json({ error: 'Failed to fetch profile.' }, { status: 500 });
    }

    const current: SavedLocation[] = Array.isArray(profile?.locations) ? profile.locations : [];

    if (current.length >= 10) {
        return NextResponse.json(
            { error: 'Maximum of 10 saved addresses reached.' },
            { status: 409 }
        );
    }

    const newEntry: SavedLocation = {
        id: crypto.randomUUID(),
        label,
        address,
        lat,
        lng,
    };

    const { error: updateError } = await admin
        .from('profiles')
        .update({ locations: [...current, newEntry] })
        .eq('id', user.id);

    if (updateError) {
        console.error('[locations POST] update error:', updateError);
        return NextResponse.json({ error: 'Failed to save location.' }, { status: 500 });
    }

    return NextResponse.json({ location: newEntry });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountLocations');
    if (limited) return limited;

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'id query parameter is required.' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { data: profile, error: fetchError } = await admin
        .from('profiles')
        .select('locations')
        .eq('id', user.id)
        .maybeSingle();

    if (fetchError) {
        console.error('[locations DELETE] fetch error:', fetchError);
        return NextResponse.json({ error: 'Failed to fetch profile.' }, { status: 500 });
    }

    const current: SavedLocation[] = Array.isArray(profile?.locations) ? profile.locations : [];
    const updated = current.filter((loc) => loc.id !== id);

    const { error: updateError } = await admin
        .from('profiles')
        .update({ locations: updated })
        .eq('id', user.id);

    if (updateError) {
        console.error('[locations DELETE] update error:', updateError);
        return NextResponse.json({ error: 'Failed to delete location.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
