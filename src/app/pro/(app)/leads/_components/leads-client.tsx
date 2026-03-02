'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type LeadRow = {
    id: string;
    status: string;
    category: string;
    service_address: string | null;
    created_at: string;
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
    const d = new Date(iso);
    return d.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function LeadsClient({
    leads,
    profilesMap,
}: {
    leads: LeadRow[];
    profilesMap: Record<string, ProfileInfo>;
}) {
    const [acceptingId, setAcceptingId] = useState<string | null>(null);

    const handleAccept = async (jobId: string) => {
        setAcceptingId(jobId);
        try {
            const res = await fetch(`/api/pro/jobs/${jobId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'quoted' }),
            });
            if (res.ok) {
                window.location.href = `/pro/jobs/${jobId}`;
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || 'Failed to accept');
            }
        } finally {
            setAcceptingId(null);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
                <p className="text-muted-foreground text-sm">
                    New leads awaiting your response. Accept to move to quoting.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Inbox</CardTitle>
                </CardHeader>
                <CardContent>
                    {leads.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">
                            No leads at the moment.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {leads.map((lead) => (
                                <li
                                    key={lead.id}
                                    className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium">
                                            {customerLabel(profilesMap, lead.client_id)}
                                        </p>
                                        <p className="text-muted-foreground text-sm">
                                            {lead.category}
                                            {lead.service_address && ` · ${lead.service_address}`}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            {formatDate(lead.created_at)}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => handleAccept(lead.id)}
                                            disabled={acceptingId === lead.id}
                                        >
                                            {acceptingId === lead.id ? 'Accepting…' : 'Accept'}
                                        </Button>
                                        <Button size="sm" variant="outline" asChild>
                                            <Link href={`/pro/jobs/${lead.id}`}>View</Link>
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
