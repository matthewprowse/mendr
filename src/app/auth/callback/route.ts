import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
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

        // Whether to route a fresh homeowner into onboarding (no phone yet).
        // Only when no explicit `next` was requested — a deep link (e.g. the
        // contact gate) takes precedence and captures the number itself.
        let needsOnboarding = false;

        if (user) {
            try {
                const admin = await createSupabaseAdminClient();

                // Email signup sets first_name/surname directly. Google OAuth
                // instead provides given_name/family_name (and name/full_name),
                // so derive the name fields from whichever the provider gave us.
                const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
                const nameParts = (meta.name || meta.full_name || '')
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean);
                const firstName = (meta.first_name || meta.given_name || nameParts[0] || '').trim();
                const surname = (
                    meta.surname ||
                    meta.family_name ||
                    (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '')
                ).trim();

                // First insert — sets the derived name; existing rows untouched.
                await admin.from('profiles').upsert(
                    {
                        id: user.id,
                        first_name: firstName,
                        surname,
                        address: meta.address ?? null,
                        profile_type: meta.profile_type === 'pro' ? 'pro' : 'customer',
                    },
                    { onConflict: 'id', ignoreDuplicates: true },
                );

                const { data: profile } = await admin
                    .from('profiles')
                    .select('phone, profile_type, first_name, surname')
                    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
                    .maybeSingle();

                // Backfill names for rows from earlier Google sign-ups that have
                // none, without overwriting a name the user has set themselves.
                const hasName = Boolean(
                    (profile?.first_name as string | null)?.trim() ||
                        (profile?.surname as string | null)?.trim(),
                );
                if (!hasName && (firstName || surname)) {
                    await admin
                        .from('profiles')
                        .update({ first_name: firstName, surname })
                        .or(`id.eq.${user.id},user_id.eq.${user.id}`);
                }

                // A homeowner with no captured number goes through onboarding.
                if (!nextParam) {
                    const isPro = profile?.profile_type === 'pro';
                    needsOnboarding = !isPro && !profile?.phone;
                }
            } catch (profileErr) {
                // Non-fatal — user can still use the app without a profile row
                console.warn('Profile upsert failed:', profileErr);
            }
        }

        if (needsOnboarding) {
            return NextResponse.redirect(`${origin}/onboarding`);
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
