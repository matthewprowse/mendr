import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import AccountClient from './client';
import type { Profile } from './client';

export const metadata: Metadata = {
    title: 'Account',
    description: 'Your Mendr account profile, password, and deletion.',
    robots: { index: false, follow: false },
};

export default async function AccountPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/settings/account');

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('profiles')
        .select('first_name, surname, description, avatar_url')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();

    const profile: Profile = {
        email: user.email ?? null,
        firstName: data?.first_name ?? '',
        surname: data?.surname ?? '',
        description: data?.description ?? '',
        avatarUrl:
            data?.avatar_url ??
            (user.user_metadata?.avatar_url as string | undefined) ??
            null,
    };

    return <AccountClient initialProfile={profile} />;
}
