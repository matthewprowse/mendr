import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import PrivacyClient from './client';
import type { ConsentState } from './client';

export const metadata: Metadata = {
    title: 'Privacy',
    description: 'Privacy settings and data export for your Mendr account.',
};

const DEFAULT_CONSENT: ConsentState = { product_analytics: true, model_training: false };

export default async function PrivacyPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/settings/privacy');

    const { data } = await supabase
        .from('user_data_consent')
        .select('product_analytics, model_training')
        .eq('user_id', user.id)
        .maybeSingle();

    const consent: ConsentState = (data as ConsentState | null) ?? DEFAULT_CONSENT;
    return <PrivacyClient initialConsent={consent} />;
}
