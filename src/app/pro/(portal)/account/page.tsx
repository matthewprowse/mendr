import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import AccountClient from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Account' },
    robots: { index: false, follow: false },
};

export default async function ProAccountPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/account');

    const { providerId, pending } = await getProviderState(user.id);

    let providerName: string | null = null;
    if (providerId) {
        const admin = await createSupabaseAdminClient();
        const { data } = await admin
            .from('providers')
            .select('name')
            .eq('id', providerId)
            .maybeSingle();
        providerName = (data as { name: string | null } | null)?.name ?? null;
    }

    return <AccountClient providerId={providerId} pending={pending} providerName={providerName} />;
}
