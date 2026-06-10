/**
 * POST /api/account/delete — permanently delete the current user.
 *
 * Requires the user to re-type their email as a confirmation. Uses the admin
 * API to delete the auth.users row; cascades drop the profile and related rows.
 *
 * After successful delete the client must call supabase.auth.signOut() — the
 * session cookie is no longer valid.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountDelete');
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const confirmEmail =
        typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';

    if (!user.email) {
        return NextResponse.json(
            { error: 'Anonymous accounts cannot be deleted via this endpoint.' },
            { status: 400 }
        );
    }
    if (confirmEmail !== user.email.toLowerCase()) {
        return NextResponse.json(
            { error: 'Confirmation email does not match.' },
            { status: 400 }
        );
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
