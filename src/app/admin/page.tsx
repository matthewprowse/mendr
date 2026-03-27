'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

type Stats = { newProviders: number; unreadMessages: number; todayStarts: number };

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
        void load();
        const iv = setInterval(load, 60_000);
        return () => clearInterval(iv);
    }, []);

    return (
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Live counts — refreshes every 60 seconds.
                </p>
            </div>

            {loading ? (
                <div className="grid gap-6 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-40 animate-pulse rounded-xl border border-border/50 bg-muted/40"
                        />
                    ))}
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-3">
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
                </div>
            )}
        </div>
    );
}
