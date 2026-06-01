/**
 * POST /api/account/password — change the current user's password.
 *
 * Requires a valid session AND the user's current password (re-auth) before
 * updating to a new one. Anonymous users cannot use this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountPassword');
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const currentPassword =
        typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword) {
        return NextResponse.json(
            { error: 'Current password is required.' },
            { status: 400 }
        );
    }
    if (newPassword.length < 8) {
        return NextResponse.json(
            { error: 'New password must be at least 8 characters.' },
            { status: 400 }
        );
    }
    if (newPassword === currentPassword) {
        return NextResponse.json(
            { error: 'New password must be different from the current one.' },
            { status: 400 }
        );
    }

    // Re-auth: verify the current password by attempting a sign-in.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });
    if (reauthError) {
        return NextResponse.json(
            { error: 'Current password is incorrect.' },
            { status: 401 }
        );
    }

    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    });
    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
