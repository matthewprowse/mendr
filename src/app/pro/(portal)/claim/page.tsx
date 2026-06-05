import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import ClaimClient from './client';

export const metadata = {
    title: { absolute: 'Mendr Pro: Claim Your Business' },
    robots: { index: false, follow: false },
};

export default async function ClaimPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/claim');

    const { providerId, pending } = await getProviderState(user.id);
    if (providerId || pending) redirect('/pro/home');

    return <ClaimClient />;
}
