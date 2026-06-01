'use client';

import { useEffect, useState } from 'react';
import { Users, Activity, Mail, Star, Image as ImageIcon } from 'lucide-react';
import { AdminPageHeader } from './components/page-header';
import { AdminStatTile } from './components/stat-tile';

type Stats = {
    newProviders: number;
    unreadMessages: number;
    todayStarts: number;
    pendingReviews: number;
    pendingGallery: number;
};

export default function AdminHome() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const load = () =>
            fetch('/api/admin/stats')
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => {
                    if (active && d) setStats(d);
                    if (active) setLoading(false);
                })
                .catch(() => {
                    if (active) setLoading(false);
                });
        load();
        const iv = setInterval(load, 60_000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, []);

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader
                    title="Home"
                    description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt."
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <AdminStatTile
                    label="Provider waitlist"
                    value={stats?.newProviders ?? 0}
                    sub="New uncontacted applicants"
                    href="/admin/providers"
                    icon={Users}
                    loading={loading}
                />
                <AdminStatTile
                    label="Today's diagnoses"
                    value={stats?.todayStarts ?? 0}
                    sub="Started today"
                    href="/admin/analytics"
                    icon={Activity}
                    loading={loading}
                />
                <AdminStatTile
                    label="Contact messages"
                    value={stats?.unreadMessages ?? 0}
                    sub="Unread"
                    href="/admin/contact"
                    icon={Mail}
                    loading={loading}
                />
                <AdminStatTile
                    label="Pending reviews"
                    value={stats?.pendingReviews ?? 0}
                    sub="Needs moderation"
                    href="/admin/reviews"
                    icon={Star}
                    loading={loading}
                />
                <AdminStatTile
                    label="Pending gallery"
                    value={stats?.pendingGallery ?? 0}
                    sub="Awaiting approval"
                    href="/admin/gallery"
                    icon={ImageIcon}
                    loading={loading}
                />
            </div>
        </div>
    );
}
