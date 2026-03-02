'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type JobRow = {
    id: string;
    status: string;
    category: string;
    service_address: string | null;
    created_at: string;
    updated_at: string;
};

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function CustomerDetailClient({
    customerId,
    customerName,
    primaryAddress,
    jobs,
}: {
    customerId: string;
    customerName: string;
    primaryAddress: string | null;
    jobs: JobRow[];
}) {
    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{customerName}</h1>
                    {primaryAddress && (
                        <p className="text-muted-foreground text-sm">{primaryAddress}</p>
                    )}
                </div>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/pro/jobs">Back to jobs</Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Job history</CardTitle>
                </CardHeader>
                <CardContent>
                    {jobs.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No jobs with this customer yet.</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {jobs.map((job) => (
                                <li key={job.id}>
                                    <Link
                                        href={`/pro/jobs/${job.id}`}
                                        className="flex flex-col gap-1 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div>
                                            <Badge variant="outline" className="mr-2">
                                                {job.status}
                                            </Badge>
                                            <span className="text-sm">{job.category}</span>
                                            {job.service_address && (
                                                <p className="text-muted-foreground text-xs truncate max-w-md">
                                                    {job.service_address}
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-muted-foreground text-xs">
                                            {formatDate(job.updated_at)}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <div className="flex gap-2">
                <Button asChild>
                    <Link href="/pro/leads">View leads</Link>
                </Button>
                <Button variant="outline" asChild>
                    <Link href="/pro/jobs">All jobs</Link>
                </Button>
            </div>
        </div>
    );
}
