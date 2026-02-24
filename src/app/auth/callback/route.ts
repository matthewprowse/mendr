import { createSupabaseServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const next = searchParams.get('next') ?? '/';

    const supabase = await createSupabaseServerClient();

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            return NextResponse.redirect(`${origin}/auth/sign-in?error=auth_callback_error`);
        }
    } else if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) {
            return NextResponse.redirect(`${origin}/auth/sign-in?error=auth_callback_error`);
        }
    } else {
        return NextResponse.redirect(`${origin}/auth/sign-in?error=missing_params`);
    }

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, surname, description')
            .eq('user_id', user.id)
            .single();

        const isProfileComplete = profile?.first_name && profile?.surname && profile?.description;

        if (!isProfileComplete) {
            return NextResponse.redirect(`${origin}/auth/onboarding`);
        }
    }

    return NextResponse.redirect(`${origin}${next}`);
}
