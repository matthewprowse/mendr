'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type ApplicationRow = {
    id: string;
    business_name: string | null;
    contact_name: string | null;
    status: 'new' | 'contacted' | 'approved' | 'rejected' | string;
    rejection_reason: string | null;
    created_at: string;
    resubmission_of: string | null;
    matched_provider_id?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
    new: "Submitted — we'll be in touch soon",
    contacted: 'Under review',
    approved: 'Approved',
    rejected: 'Rejected',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    new: 'secondary',
    contacted: 'secondary',
    approved: 'default',
    rejected: 'destructive',
};

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AccountClient({ applications }: { applications: ApplicationRow[] }) {
    const router = useRouter();
    const [isReapplying, setIsReapplying] = useState(false);
    const [reapplyError, setReapplyError] = useState<string | null>(null);

    const application = applications[0] ?? null;

    async function handleReapply(applicationId: string) {
        setIsReapplying(true);
        setReapplyError(null);
        try {
            const res = await fetch('/api/contractors/account/reapply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId }),
            });
            const json = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
            if (!res.ok || !json?.id) {
                setReapplyError(json?.error ?? 'Could not start a new application. Please try again.');
                return;
            }
            router.push(`/contractors/network?resume=${json.id}`);
        } catch {
            setReapplyError('Network error. Please try again.');
        } finally {
            setIsReapplying(false);
        }
    }

    if (!application) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
                <Card className="w-full max-w-sm">
                    <CardHeader>
                        <CardTitle>My Account</CardTitle>
                        <CardDescription>You haven't applied yet.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="mb-6 text-sm text-muted-foreground">
                            Join the Mendr contractor network to start receiving qualified homeowner
                            enquiries.
                        </p>
                        <Button
                            className="w-full"
                            onClick={() => router.push('/contractors/network')}
                        >
                            Apply Now
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const displayName = application.business_name?.trim() || application.contact_name?.trim() || 'Your application';
    const statusLabel = STATUS_LABELS[application.status] ?? application.status;
    const statusVariant = STATUS_VARIANTS[application.status] ?? 'outline';

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-3">
                        <span>{displayName}</span>
                        <Badge variant={statusVariant} className="mt-0.5 shrink-0">
                            {statusLabel}
                        </Badge>
                    </CardTitle>
                    <CardDescription>
                        Submitted {formatDate(application.created_at)}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {application.status === 'approved' && (
                        <p className="text-sm text-green-700">
                            Your profile is live.{' '}
                            {application.matched_provider_id ? (
                                <a
                                    href={`/contractors/${application.matched_provider_id}`}
                                    className="underline underline-offset-2"
                                >
                                    View your profile
                                </a>
                            ) : null}
                        </p>
                    )}

                    {(application.status === 'new' || application.status === 'contacted') && (
                        <p className="text-sm text-muted-foreground">
                            Your application is being reviewed. We'll be in touch soon.
                        </p>
                    )}

                    {application.status === 'rejected' && (
                        <div className="flex flex-col gap-3">
                            <p className="text-sm text-muted-foreground">
                                {application.rejection_reason?.trim() ||
                                    'Your application did not meet our current criteria.'}
                            </p>
                            {reapplyError && (
                                <p className="text-sm text-red-600" role="alert">
                                    {reapplyError}
                                </p>
                            )}
                            <Button
                                onClick={() => void handleReapply(application.id)}
                                disabled={isReapplying}
                                className={cn('w-full')}
                            >
                                {isReapplying ? 'Starting…' : 'Amend and Reapply'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
