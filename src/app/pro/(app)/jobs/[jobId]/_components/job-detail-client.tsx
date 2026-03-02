'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Job = {
    id: string;
    status: string;
    category: string;
    service_address: string | null;
    created_at: string;
    updated_at: string;
    client_id: string | null;
    is_paid: boolean;
    payment_proof_url: string | null;
};

type Client = {
    id: string;
    first_name: string | null;
    surname: string | null;
} | null;

type Quote = {
    parts?: unknown[];
    labour?: unknown[];
    total?: number;
};

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}

function statusBadgeVariant(status: string) {
    switch (status) {
        case 'lead':
            return 'secondary';
        case 'quoted':
            return 'outline';
        case 'active':
            return 'default';
        case 'completed':
            return 'default';
        case 'cancelled':
            return 'destructive';
        default:
            return 'outline';
    }
}

export function JobDetailClient({
    job,
    client,
    diagnosisSummary,
    reportId,
    quote,
}: {
    job: Job;
    client: Client;
    diagnosisSummary: string | null;
    reportId: string | null;
    quote: Quote;
}) {
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const total = quote.total ?? 0;

    const clientName = client
        ? [client.first_name, client.surname].filter(Boolean).join(' ') || 'Customer'
        : 'Customer';

    const handleStatusChange = async (newStatus: string) => {
        setUpdatingStatus(true);
        try {
            const res = await fetch(`/api/pro/jobs/${job.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                window.location.reload();
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || 'Update failed');
            }
        } finally {
            setUpdatingStatus(false);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Job {job.id.slice(0, 8)}
                        </h1>
                        <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        {job.category} · Created {formatDate(job.created_at)}
                    </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/pro/jobs">Back to jobs</Link>
                </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Customer snapshot */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Customer</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="font-medium">{clientName}</p>
                        {job.service_address && (
                            <p className="text-muted-foreground text-sm">{job.service_address}</p>
                        )}
                        <Button variant="outline" size="sm" asChild>
                            <Link href={job.client_id ? `/pro/customers/${job.client_id}` : '#'}>
                                View customer page
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                {/* Diagnosis context */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Diagnosis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {diagnosisSummary ? (
                            <p className="text-muted-foreground text-sm">{diagnosisSummary}</p>
                        ) : (
                            <p className="text-muted-foreground text-sm">No diagnosis linked.</p>
                        )}
                        {reportId && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/report/${reportId}`} target="_blank" rel="noopener noreferrer">
                                    View report
                                </Link>
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Messaging placeholder */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Messages</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">
                        Thread with customer. Image, document, and video upload will be available here (Phase 2).
                    </p>
                </CardContent>
            </Card>

            {/* Quote / Invoice */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Quote / Invoice</CardTitle>
                    {job.status === 'lead' && (
                        <Button
                            size="sm"
                            disabled={updatingStatus}
                            onClick={() => handleStatusChange('quoted')}
                        >
                            {updatingStatus ? 'Updating…' : 'Accept lead'}
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-muted-foreground text-sm">
                            Line items, call-out fee, and travel can be set when sending the quote.
                        </p>
                        <p className="mt-2 font-medium">Total: {formatCurrency(total)}</p>
                    </div>
                    {job.status === 'quoted' && (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingStatus}
                            onClick={() => handleStatusChange('active')}
                        >
                            Mark as accepted
                        </Button>
                    )}
                    {job.status === 'active' && (
                        <Button
                            size="sm"
                            disabled={updatingStatus}
                            onClick={() => handleStatusChange('completed')}
                        >
                            Mark as completed
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Finance (when completed) */}
            {(job.status === 'completed' || job.is_paid) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Finance</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-sm">
                            Paid: <strong>{job.is_paid ? 'Yes' : 'No'}</strong>
                        </p>
                        {job.payment_proof_url && (
                            <a
                                href={job.payment_proof_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary text-sm underline"
                            >
                                View payment proof
                            </a>
                        )}
                        {job.status === 'completed' && !job.is_paid && (
                            <p className="text-muted-foreground text-sm">
                                Toggle paid and upload proof in Finance table (Phase 4.6).
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
