/**
 * Homeowner global lead-share consent mode (Phase 2/3 of the onboarding plan).
 *
 * `ask_each_time` (default) shows the per-contact consent modal at the contact
 * gate; `always_share` skips it. The modal's "do not ask again" checkbox flips
 * this to `always_share`. Revocable from settings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

type Mode = 'ask_each_time' | 'always_share';

export async function GET(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { data } = await supabase
        .from('lead_share_consent_settings')
        .select('mode')
        .eq('user_id', user.id)
        .maybeSingle();

    return NextResponse.json({ mode: (data?.mode as Mode | undefined) ?? 'ask_each_time' });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
    const mode = body.mode;
    if (mode !== 'ask_each_time' && mode !== 'always_share') {
        return NextResponse.json({ error: 'mode must be ask_each_time or always_share.' }, { status: 400 });
    }

    const { error } = await supabase
        .from('lead_share_consent_settings')
        .upsert(
            { user_id: user.id, mode, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, mode });
}
