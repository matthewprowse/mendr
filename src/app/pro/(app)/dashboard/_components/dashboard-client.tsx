'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type JobRow = {
    id: string;
    status: string;
    category: string;
    service_address: string | null;
    created_at?: string;
    updated_at?: string;
    client_id: string | null;
};

type ProfileInfo = {
    id: string;
    first_name: string | null;
    surname: string | null;
};

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}

function customerLabel(profilesMap: Record<string, ProfileInfo>, clientId: string | null) {
    if (!clientId) return 'Customer';
    const p = profilesMap[clientId];
    if (!p) return 'Customer';
    const parts = [p.first_name, p.surname].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Customer';
}

export function DashboardClient({
    newLeadsCount,
    openJobsCount,
    revenueThisMonth,
    recentLeads,
    recentJobs,
    profilesMap,
    planLabel,
    planFeeFormatted,
    seatCount,
    seatLimit,
    badgeEarned,
    badgeCopy,
    atSeatLimit,
}: {
    newLeadsCount: number;
    openJobsCount: number;
    revenueThisMonth: number;
    recentLeads: JobRow[];
    recentJobs: JobRow[];
    profilesMap: Record<string, ProfileInfo>;
    planLabel: string;
    planFeeFormatted: string;
    seatCount: number;
    seatLimit: number | null;
    badgeEarned: string;
    badgeCopy: string;
    atSeatLimit: boolean;
}) {
    const seatLabel = seatLimit === null ? `${seatCount} seats` : `${seatCount}/${seatLimit} seats`;

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground text-sm">Overview of your leads and jobs.</p>
            </div>

            {/* Phase 3: Plan & badge card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base">Your plan</CardTitle>
                    <Badge variant="default" className="font-medium bg-primary/90 text-primary-foreground">
                        {badgeEarned}
                    </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{planLabel}</span>
                        {' · '}
                        {planFeeFormatted}
                        {' · '}
                        {seatLabel}
                    </p>
                    <p className="text-sm text-muted-foreground">{badgeCopy}</p>
                    {atSeatLimit && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                            You&apos;re at your seat limit. Upgrade to add more team members.
                        </p>
                    )}
                    <Button variant="outline" size="sm" className="mt-2" asChild>
                        <Link href="/pro/upgrade">Upgrade plan</Link>
                    </Button>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">New leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{newLeadsCount}</div>
                        <p className="text-muted-foreground text-xs">Awaiting your response</p>
                        <Button variant="outline" size="sm" className="mt-2" asChild>
                            <Link href="/pro/leads">View leads</Link>
                        </Button>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open jobs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{openJobsCount}</div>
                        <p className="text-muted-foreground text-xs">Quoted or in progress</p>
                        <Button variant="outline" size="sm" className="mt-2" asChild>
                            <Link href="/pro/jobs">View jobs</Link>
                        </Button>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue this month</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(revenueThisMonth)}</div>
                        <p className="text-muted-foreground text-xs">Completed jobs</p>
                        <Button variant="outline" size="sm" className="mt-2" asChild>
                            <Link href="/pro/finance">View finance</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base">Recent leads</CardTitle>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/pro/leads">View all</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {recentLeads.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No leads yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {recentLeads.map((lead) => (
                                    <li key={lead.id}>
                                        <Link
                                            href={`/pro/jobs/${lead.id}`}
                                            className="block rounded-md border border-transparent p-2 text-sm transition-colors hover:bg-muted/50 hover:border-border"
                                        >
                                            <span className="font-medium">
                                                {customerLabel(profilesMap, lead.client_id)}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {' '}
                                                · {lead.category}
                                                {lead.service_address && ` · ${lead.service_address.slice(0, 30)}…`}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base">Recent jobs</CardTitle>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/pro/jobs">View all</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {recentJobs.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No recent jobs.</p>
                        ) : (
                            <ul className="space-y-2">
                                {recentJobs.map((job) => (
                                    <li key={job.id}>
                                        <Link
                                            href={`/pro/jobs/${job.id}`}
                                            className="block rounded-md border border-transparent p-2 text-sm transition-colors hover:bg-muted/50 hover:border-border"
                                        >
                                            <span className="font-medium">
                                                {customerLabel(profilesMap, job.client_id)}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {' '}
                                                · {job.status} · {job.category}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
