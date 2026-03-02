'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type JobRow = {
    id: string;
    status: string;
    category: string;
    service_address: string | null;
    created_at: string;
    updated_at: string;
    client_id: string | null;
};

type ProfileInfo = {
    id: string;
    first_name: string | null;
    surname: string | null;
};

function customerLabel(profilesMap: Record<string, ProfileInfo>, clientId: string | null) {
    if (!clientId) return 'Customer';
    const p = profilesMap[clientId];
    if (!p) return 'Customer';
    const parts = [p.first_name, p.surname].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Customer';
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function statusVariant(s: string) {
    switch (s) {
        case 'quoted':
            return 'secondary';
        case 'active':
            return 'default';
        case 'completed':
            return 'outline';
        default:
            return 'outline';
    }
}

export function JobsListClient({
    jobs,
    profilesMap,
}: {
    jobs: JobRow[];
    profilesMap: Record<string, ProfileInfo>;
}) {
    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
                <p className="text-muted-foreground text-sm">
                    Quoted, active, and completed jobs.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">All jobs</CardTitle>
                </CardHeader>
                <CardContent>
                    {jobs.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">
                            No jobs yet. Accept a lead to get started.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {jobs.map((job) => (
                                <li key={job.id}>
                                    <Link
                                        href={`/pro/jobs/${job.id}`}
                                        className="flex flex-col gap-1 py-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">
                                                    {customerLabel(profilesMap, job.client_id)}
                                                </span>
                                                <Badge variant={statusVariant(job.status)}>
                                                    {job.status}
                                                </Badge>
                                            </div>
                                            <p className="text-muted-foreground text-sm">
                                                {job.category}
                                                {job.service_address && ` · ${job.service_address.slice(0, 40)}${job.service_address.length > 40 ? '…' : ''}`}
                                            </p>
                                            <p className="text-muted-foreground text-xs">
                                                Updated {formatDate(job.updated_at)}
                                            </p>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
