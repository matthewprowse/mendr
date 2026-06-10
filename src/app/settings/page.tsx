import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import SettingsClient from './client';

export const metadata: Metadata = {
    title: 'Settings',
    description: 'Your Mendr account settings.',
    robots: { index: false, follow: false },
};

export default async function SettingsPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/settings');
    return <SettingsClient />;
}
