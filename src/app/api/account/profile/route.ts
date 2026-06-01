/**
 * GET  /api/account/profile  — fetch the current user's profile row.
 * PATCH /api/account/profile — update first_name / surname / description.
 *
 * Auth required for both. The profile row is created by the handle_new_user
 * trigger on auth.users insert, so this endpoint should always find one for
 * a real (non-anonymous) user.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

const ALLOWED_FIELDS = ['first_name', 'surname', 'description'] as const;

export async function GET(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('profiles')
        .select('first_name, surname, description, avatar_url, locations, created_at')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        email: user.email ?? null,
        firstName: data?.first_name ?? '',
        surname: data?.surname ?? '',
        description: data?.description ?? '',
        // Prefer the value stored in profiles (set by our own upload flow).
        // Fall back to the OAuth provider's photo (e.g. Google) stored in
        // user_metadata — this keeps the settings form in sync with UserAvatar
        // for users who have never used the manual upload.
        avatarUrl: data?.avatar_url ?? (user.user_metadata?.avatar_url as string | null) ?? null,
        locations: data?.locations ?? [],
        createdAt: data?.created_at ?? null,
    });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const update: Record<string, string> = {};
    for (const key of ALLOWED_FIELDS) {
        if (typeof body[key] === 'string') {
            update[key] = (body[key] as string).trim().slice(0, 200);
        }
    }
    if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('profiles')
        .update(update)
        .or(`id.eq.${user.id},user_id.eq.${user.id}`);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...update });
}
