import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

const DEFAULT_PREFS = {
    followup_enabled: true,
    rating_enabled: true,
    reengagement_enabled: true,
    product_updates_enabled: true,
};

export async function GET(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { data } = await supabase
        .from('notification_preferences')
        .select('followup_enabled, rating_enabled, reengagement_enabled, product_updates_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    return NextResponse.json(data ?? DEFAULT_PREFS);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, boolean> = {};
    for (const key of ['followup_enabled', 'rating_enabled', 'reengagement_enabled', 'product_updates_enabled']) {
        if (typeof body[key] === 'boolean') patch[key] = body[key] as boolean;
    }
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'No valid fields provided.' }, { status: 400 });
    }

    const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
