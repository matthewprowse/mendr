import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import NotificationsClient from './client';
import type { Prefs } from './client';

export const metadata: Metadata = {
    title: 'Notifications',
    description: 'Notification preferences for your Mendr account.',
    robots: { index: false, follow: false },
};

const DEFAULT_PREFS: Prefs = {
    followup_enabled: true,
    rating_enabled: true,
    reengagement_enabled: true,
    product_updates_enabled: true,
};

export default async function NotificationsPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/settings/notifications');

    const { data } = await supabase
        .from('notification_preferences')
        .select('followup_enabled, rating_enabled, reengagement_enabled, product_updates_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    const prefs: Prefs = (data as Prefs | null) ?? DEFAULT_PREFS;
    return <NotificationsClient initialPrefs={prefs} />;
}
