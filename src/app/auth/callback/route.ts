import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { safeRedirectPath } from '@/lib/safe-redirect';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const nextParam = searchParams.get('next');

    if (!code) {
        return NextResponse.redirect(`${origin}/?error=auth_missing_code`);
    }

    try {
        const supabase = await createSupabaseServerClient();
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
            console.error('Auth callback exchange error:', exchangeError.message);
            return NextResponse.redirect(`${origin}/?error=auth_exchange_failed`);
        }

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (user) {
            // Upsert profile — only sets values on first insert; existing rows are untouched.
            try {
                const admin = await createSupabaseAdminClient();
                await admin.from('profiles').upsert(
                    {
                        id: user.id,
                        first_name: user.user_metadata?.first_name ?? '',
                        surname: user.user_metadata?.surname ?? '',
                        address: user.user_metadata?.address ?? null,
                    },
                    { onConflict: 'id', ignoreDuplicates: true }
                );
            } catch (profileErr) {
                // Non-fatal — user can still use the app without a profile row
                console.warn('Profile upsert failed:', profileErr);
            }
        }

        // Redirect to the originally-requested page (or home).
        // safeRedirectPath rejects protocol-relative, scheme-bearing, and
        // backslash-prefixed `next` values, falling back to `/`.
        const safePath = safeRedirectPath(nextParam, '/');
        return NextResponse.redirect(`${origin}${safePath}`);
    } catch (err) {
        console.error('Auth callback error:', err);
        return NextResponse.redirect(`${origin}/?error=auth_server_error`);
    }
}
