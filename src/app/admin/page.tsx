'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AdminPageHeader } from './_components/admin-page-header';

type Stats = {
    newProviders: number;
    unreadMessages: number;
    todayStarts: number;
    pendingReviews: number;
    pendingGallery: number;
};

function StatCard({
    label,
    value,
    sub,
    href,
}: {
    label: string;
    value: number;
    sub: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="group flex flex-col gap-4 rounded-xl border border-border/50 bg-background p-6 transition-all hover:border-border hover:shadow-sm"
        >
            <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="text-4xl font-bold tracking-tight text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
        </Link>
    );
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        const res = await fetch('/api/admin/stats');
        if (res.ok) setStats(await res.json());
        setLoading(false);
    }

    useEffect(() => {
        const tick = () => {
            window.setTimeout(() => {
                void load();
            }, 0);
        };
        tick();
        const iv = setInterval(tick, 60_000);
        return () => clearInterval(iv);
    }, [load]);

    return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-8">
                <AdminPageHeader title="Home" />
            </div>

            {loading ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="h-40 animate-pulse rounded-xl border border-border/50 bg-muted/40"
                        />
                    ))}
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
                    <StatCard
                        label="Provider Waitlist"
                        value={stats?.newProviders ?? 0}
                        sub="New uncontacted applicants"
                        href="/admin/providers"
                    />
                    <StatCard
                        label="Today's Diagnoses"
                        value={stats?.todayStarts ?? 0}
                        sub="welcome_start events today"
                        href="/admin/analytics"
                    />
                    <StatCard
                        label="Contact Messages"
                        value={stats?.unreadMessages ?? 0}
                        sub="Unread messages"
                        href="/admin/contact"
                    />
                    <StatCard
                        label="Pending Reviews"
                        value={stats?.pendingReviews ?? 0}
                        sub="Needs moderation"
                        href="/admin/reviews"
                    />
                    <StatCard
                        label="Pending Gallery"
                        value={stats?.pendingGallery ?? 0}
                        sub="Images awaiting approval"
                        href="/admin/gallery"
                    />
                </div>
            )}
        </div>
    );
}
