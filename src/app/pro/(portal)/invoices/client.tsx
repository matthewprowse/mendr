'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatRelativeDate } from '@/lib/format-date';
import { formatZar } from '@/lib/format-money';

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue';

export type InvoiceRow = {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    total: number;
    amountPaid: number;
    customerName: string | null;
    createdAt: string;
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
    draft: 'Draft',
    sent: 'Sent',
    partial: 'Part Paid',
    paid: 'Paid',
    overdue: 'Overdue',
};

export default function InvoicesClient({ rows }: { rows: InvoiceRow[] }) {
    const router = useRouter();
    const [creating, setCreating] = useState(false);

    const create = async () => {
        if (creating) return;
        setCreating(true);
        try {
            const res = await fetch('/api/pro/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const json = (await res.json().catch(() => null)) as {
                id?: string;
                error?: string;
            } | null;
            if (!res.ok || !json?.id) {
                toast.error(json?.error ?? 'Could not create invoice.');
                return;
            }
            router.push(`/pro/invoices/${json.id}`);
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
                    <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
                    <p className="text-sm text-muted-foreground">
                        Issue invoices and track what has been paid.
                    </p>
                </div>
                <Button
                    size="sm"
                    className="shrink-0"
                    disabled={creating}
                    onClick={() => void create()}
                >
                    {creating ? 'Creating…' : 'New Invoice'}
                </Button>
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
                <div className="flex flex-col">
                    {rows.map((inv, i) => (
                        <Fragment key={inv.id}>
                            {i > 0 && <Separator />}
                            <Link
                                href={`/pro/invoices/${inv.id}`}
                                className="flex items-center gap-3 py-3"
                            >
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {inv.number ?? 'Draft'}
                                        {inv.customerName ? ` · ${inv.customerName}` : ''}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {INVOICE_STATUS_LABEL[inv.status]} ·{' '}
                                        {formatRelativeDate(inv.createdAt)}
                                    </p>
                                </div>
                                <span className="shrink-0 whitespace-nowrap text-sm font-medium text-foreground">
                                    {formatZar(inv.total)}
                                </span>
                            </Link>
                        </Fragment>
                    ))}
                </div>
            )}
        </>
    );
}
