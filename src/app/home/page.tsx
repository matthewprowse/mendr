import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getHomeStats, getRecentDiagnoses, getDiagnosesSeries } from '@/features/home/stats';
import { getLatestAnnouncements } from '@/features/home/announcements';
import HomeClient from './client';

export const metadata: Metadata = {
    title: 'Home',
    description: 'Your Mendr home.',
    robots: { index: false, follow: false },
};

export default async function HomePage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/auth/login?next=/home');

    const [{ platform, user: userStats }, recentDiagnoses, diagnosesSeries, announcements] = await Promise.all([
        getHomeStats(user.id),
        getRecentDiagnoses(user.id, 3),
        getDiagnosesSeries(user.id),
        getLatestAnnouncements(3),
    ]);

    return (
        <HomeClient
            platform={platform}
            userStats={userStats}
            recentDiagnoses={recentDiagnoses}
            diagnosesSeries={diagnosesSeries}
            announcements={announcements.map((a) => ({
                slug: a.slug,
                title: a.title,
                summary: a.summary,
                published_at: a.published_at,
            }))}
        />
    );
}
