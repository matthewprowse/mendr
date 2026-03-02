import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { SettingsClient } from './_components/settings-client';

export const metadata: Metadata = {
    title: 'Settings',
    description: 'Pro account and business settings.',
};

export default async function ProSettingsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/settings');
    }

    const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id, slug, plan_tier, base_callout_fee, rate_per_km')
        .eq('id', user.id)
        .single();
    if (!providerProfile) {
        redirect('/pro/claim');
    }

    return (
        <SettingsClient
            slug={providerProfile.slug}
            planTier={providerProfile.plan_tier ?? 'solo_starter'}
            baseCalloutFee={providerProfile.base_callout_fee ?? null}
            ratePerKm={providerProfile.rate_per_km ?? null}
        />
    );
}
