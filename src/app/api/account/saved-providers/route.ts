import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';

async function getUser() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

/** GET /api/account/saved-providers?providerId=<id> — check if saved */
export async function GET(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'savedProviders');
    if (limited) return limited;

    const user = await getUser();
    if (!user) return NextResponse.json({ saved: false });

    const providerId = req.nextUrl.searchParams.get('providerId');
    if (!providerId) return NextResponse.json({ error: 'Missing providerId.' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('saved_providers')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider_id', providerId)
        .maybeSingle();

    return NextResponse.json({ saved: Boolean(data) });
}

/** POST /api/account/saved-providers — toggle save; returns { saved: boolean } */
export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'savedProviders');
    if (limited) return limited;

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { providerId } = body as { providerId?: string };
    if (!providerId) return NextResponse.json({ error: 'Missing providerId.' }, { status: 400 });

    const admin = await createSupabaseAdminClient();

    const { data: existing } = await admin
        .from('saved_providers')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider_id', providerId)
        .maybeSingle();

    if (existing) {
        await admin.from('saved_providers').delete().eq('id', existing.id);
        return NextResponse.json({ saved: false });
    }

    await admin.from('saved_providers').insert({ user_id: user.id, provider_id: providerId });
    return NextResponse.json({ saved: true });
}
