'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatRelativeDate } from '@/lib/format-date';
import { formatZar } from '@/lib/format-money';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export type QuoteRow = {
    id: string;
    number: string;
    status: QuoteStatus;
    total: number;
    customerName: string | null;
    createdAt: string;
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
    draft: 'Draft',
    sent: 'Sent',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
};

export default function QuotesClient({ rows }: { rows: QuoteRow[] }) {
    const router = useRouter();
    const [creating, setCreating] = useState(false);

    const create = async () => {
        if (creating) return;
        setCreating(true);
        try {
            const res = await fetch('/api/pro/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const json = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
            if (!res.ok || !json?.id) {
                toast.error(json?.error ?? 'Could not create quote.');
                return;
            }
            router.push(`/pro/quotes/${json.id}`);
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Quotes</h1>
                    <p className="text-sm text-muted-foreground">
                        Build and send quotes, and track which ones are accepted.
                    </p>
                </div>
                <Button size="sm" className="shrink-0" disabled={creating} onClick={() => void create()}>
                    {creating ? 'Creating…' : 'New Quote'}
                </Button>
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quotes yet.</p>
            ) : (
                <div className="flex flex-col">
                    {rows.map((q, i) => (
                        <Fragment key={q.id}>
                            {i > 0 && <Separator />}
                            <Link href={`/pro/quotes/${q.id}`} className="flex items-center gap-3 py-3">
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {q.number}
                                        {q.customerName ? ` · ${q.customerName}` : ''}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {QUOTE_STATUS_LABEL[q.status]} · {formatRelativeDate(q.createdAt)}
                                    </p>
                                </div>
                                <span className="shrink-0 whitespace-nowrap text-sm font-medium text-foreground">
                                    {formatZar(q.total)}
                                </span>
                            </Link>
                        </Fragment>
                    ))}
                </div>
            )}
        </>
    );
}
