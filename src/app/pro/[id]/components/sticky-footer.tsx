'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';

const STORAGE_KEY = 'scandio_my_reports';

type ReportEntry = { conversationId: string; title: string; date: string };

function getStoredReports(): ReportEntry[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

export function ProStickyFooter({
    providerName,
    providerPhone,
    website,
    directionsHref,
    email,
}: {
    providerName: string;
    providerPhone?: string | null;
    website?: string | null;
    directionsHref?: string | null;
    email?: string | null;
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const reports = getStoredReports();

    const sendReport = useCallback(
        async (conversationId: string) => {
            if (!providerPhone) {
                toast.error('This provider has no phone number.');
                return;
            }
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/report-info?conversation_id=${encodeURIComponent(conversationId)}`
                );
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Could not load report');
                }
                const info = await res.json();
                const msgRes = await fetch('/api/whatsapp-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        diagnosis: info.diagnosis || 'Home repair or maintenance',
                        provider_name: providerName,
                        trade: info.trade,
                        report_url: info.report_url,
                    }),
                });
                const msgData = await msgRes.json();
                if (!msgRes.ok) throw new Error(msgData.error || 'Could not generate message');
                const message = msgData.message as string;
                const waNum = String(providerPhone).replace(/\D/g, '');
                if (!waNum) {
                    toast.error('Invalid phone number.');
                    return;
                }
                setOpen(false);
                window.open(
                    `https://wa.me/${waNum}?text=${encodeURIComponent(message)}`,
                    '_blank'
                );
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed to send report');
            } finally {
                setLoading(false);
            }
        },
        [providerName, providerPhone]
    );

    return (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-muted-foreground md:text-sm">
                    Share your Scandio report or get in touch with this pro.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    {providerPhone && (
                        <Popover open={open} onOpenChange={setOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    size="sm"
                                    className="flex-1 whitespace-nowrap"
                                    disabled={loading}
                                >
                                    {loading ? 'Preparing…' : 'Send report via WhatsApp'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-3" align="end">
                                <p className="text-sm font-medium text-muted-foreground mb-2">
                                    Choose a report to send
                                </p>
                                {reports.length === 0 ? (
                                    <p className="text-xs text-muted-foreground mb-3">
                                        No reports yet. Start a scan to create a report, then come back here to send it to this pro.
                                    </p>
                                ) : (
                                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                                        {reports.map((r) => (
                                            <li key={r.conversationId}>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-start text-left font-normal"
                                                    onClick={() => sendReport(r.conversationId)}
                                                    disabled={loading}
                                                >
                                                    {r.title || `Report ${new Date(r.date).toLocaleDateString()}`}
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                                    <a href="/scan/new">Start a new scan</a>
                                </Button>
                            </PopoverContent>
                        </Popover>
                    )}
                    {website && (
                        <Button variant="secondary" size="sm" className="flex-1 whitespace-nowrap" asChild>
                            <a href={website} target="_blank" rel="noopener noreferrer">
                                Website
                            </a>
                        </Button>
                    )}
                    {directionsHref && (
                        <Button variant="outline" size="sm" className="flex-1 whitespace-nowrap" asChild>
                            <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                                Directions
                            </a>
                        </Button>
                    )}
                    {providerPhone && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="hidden flex-1 whitespace-nowrap md:inline-flex"
                            asChild
                        >
                            <a href={`tel:${providerPhone}`}>Call</a>
                        </Button>
                    )}
                    {email && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="hidden flex-1 whitespace-nowrap md:inline-flex"
                            asChild
                        >
                            <a href={`mailto:${email}`}>Email</a>
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
