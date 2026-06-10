/**
 * POST /api/account/password — change the current user's password.
 *
 * Requires a valid session AND the user's current password (re-auth) before
 * updating to a new one. Anonymous users cannot use this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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

    // Re-auth on a throwaway client (persistSession: false) so verifying the old
    // password does not rotate the user's real session cookies as a side effect
    // and risk leaving an inconsistent state on partial failure (finding M11).
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }
    const verifier = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: reauthError } = await verifier.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });
    if (reauthError) {
        return NextResponse.json(
            { error: 'Current password is incorrect.' },
            { status: 401 }
        );
    }

    // Update on the real, cookie-bound session client.

    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    });
    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
