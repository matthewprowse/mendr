import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import OnboardingClient from './client';

export const dynamic = 'force-dynamic';

/**
 * Homeowner onboarding (Phase 1). Captures a mobile number and at least one
 * saved address. Reached automatically after first Google sign-in when the
 * profile has no phone yet, and reachable directly. Skippable, but the contact
 * gate re-prompts for the number later.
 */
export default async function OnboardingPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/auth/login?next=/onboarding');
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('phone, locations')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();

    const hasAddress = Array.isArray(profile?.locations) && profile.locations.length > 0;

    return (
        <OnboardingClient
            initialPhone={(profile?.phone as string | null) ?? null}
            initialHasAddress={hasAddress}
        />
    );
}
