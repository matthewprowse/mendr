'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { formatZar } from '@/lib/format-money';
import { INVOICE_STATUS_LABEL, type InvoiceStatus } from '../client';

const VAT_RATE = 0.15;
const round2 = (n: number) => Math.round(n * 100) / 100;

type ItemDraft = { description: string; qty: string; unitPrice: string };

export type InvoiceEditorData = {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    issued: boolean;
    customerName: string | null;
    depositPercent: string;
    dueDate: string;
    terms: string;
    total: number;
    amountPaid: number;
    vatRegistered: boolean;
    items: ItemDraft[];
};

export default function InvoiceEditorClient({ data }: { data: InvoiceEditorData }) {
    const router = useRouter();

    const [items, setItems] = useState<ItemDraft[]>(
        data.items.length > 0 ? data.items : [{ description: '', qty: '1', unitPrice: '0' }],
    );
    const [depositPercent, setDepositPercent] = useState(data.depositPercent);
    const [dueDate, setDueDate] = useState(data.dueDate);
    const [terms, setTerms] = useState(data.terms);

    const [saving, setSaving] = useState(false);
    const [issuing, setIssuing] = useState(false);
    const [confirmIssue, setConfirmIssue] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [paying, setPaying] = useState(false);

    const totals = useMemo(() => {
        const subtotal = round2(
            items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0),
        );
        const vat = data.vatRegistered ? round2(subtotal * VAT_RATE) : 0;
        return { subtotal, vat, total: round2(subtotal + vat) };
    }, [items, data.vatRegistered]);

    const balance = round2(data.total - data.amountPaid);

    const updateItem = (idx: number, patch: Partial<ItemDraft>) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    const addItem = () =>
        setItems((prev) => [...prev, { description: '', qty: '1', unitPrice: '0' }]);
    const removeItem = (idx: number) =>
        setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

    const save = async (): Promise<boolean> => {
        setSaving(true);
        try {
            const res = await fetch(`/api/pro/invoices/${data.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, depositPercent, dueDate, terms }),
            });
            if (!res.ok) {
                const j = (await res.json().catch(() => null)) as { error?: string } | null;
                toast.error(j?.error ?? 'Could not save invoice.');
                return false;
            }
            router.refresh();
            return true;
        } catch {
            toast.error('Network error. Please try again.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const issue = async () => {
        setIssuing(true);
        const ok = await save();
        if (!ok) {
            setIssuing(false);
            return;
        }
        try {
            const res = await fetch(`/api/pro/invoices/${data.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'issue' }),
            });
            const j = (await res.json().catch(() => null)) as {
                number?: string;
                error?: string;
            } | null;
            if (!res.ok) {
                toast.error(j?.error ?? 'Could not issue invoice.');
                return;
            }
            toast.success(`Invoice ${j?.number ?? ''} issued.`);
            setConfirmIssue(false);
            router.refresh();
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setIssuing(false);
        }
    };

    const recordPayment = async () => {
        const amount = Number(payAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error('Enter a positive amount.');
            return;
        }
        setPaying(true);
        try {
            const res = await fetch(`/api/pro/invoices/${data.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'payment', amount }),
            });
            const j = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                toast.error(j?.error ?? 'Could not record payment.');
                return;
            }
            toast.success('Payment recorded.');
            setPayOpen(false);
            setPayAmount('');
            router.refresh();
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setPaying(false);
        }
    };

    // --- Issued (locked) view ---
    if (data.issued) {
        return (
            <>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl font-semibold text-foreground">
                            {data.number ?? 'Invoice'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {INVOICE_STATUS_LABEL[data.status]}
                            {data.customerName ? ` · ${data.customerName}` : ''}
                        </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                        <Link href={`/invoice/${data.id}`} target="_blank">
                            View / Print
                        </Link>
                    </Button>
                </div>

                <div className="flex flex-col rounded-lg border border-border">
                    {data.items.map((it, i) => (
                        <Fragment key={i}>
                            {i > 0 && <Separator />}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-foreground">
                                        {it.description || '—'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {it.qty} × {formatZar(Number(it.unitPrice) || 0)}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-medium text-foreground">
                                    {formatZar(
                                        (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
                                    )}
                                </span>
                            </div>
                        </Fragment>
                    ))}
                </div>

                <div className="flex flex-col gap-1.5 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-medium text-foreground">
                            {formatZar(data.total)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="font-medium text-foreground">
                            {formatZar(data.amountPaid)}
                        </span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Balance Due</span>
                        <span className="text-base font-semibold text-foreground">
                            {formatZar(balance)}
                        </span>
                    </div>
                </div>

                {data.status !== 'paid' && (
                    <Button onClick={() => setPayOpen(true)}>Record Payment</Button>
                )}

                <Dialog open={payOpen} onOpenChange={setPayOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Record Payment</DialogTitle>
                            <DialogDescription>
                                Balance due is {formatZar(balance)}.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3">
                            <Label htmlFor="pay-amount">Amount</Label>
                            <Input
                                id="pay-amount"
                                inputMode="decimal"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                placeholder={String(balance)}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setPayOpen(false)}
                                disabled={paying}
                            >
                                Cancel
                            </Button>
                            <Button onClick={() => void recordPayment()} disabled={paying}>
                                {paying ? 'Saving…' : 'Record Payment'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    // --- Draft (editable) view ---
    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">Draft Invoice</h1>
                <p className="text-sm text-muted-foreground">
                    {data.customerName ?? 'No customer linked'}
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <Label>Line Items</Label>
                {items.map((it, idx) => (
                    <div
                        key={idx}
                        className="flex flex-col gap-2 rounded-lg border border-border p-3"
                    >
                        <Input
                            value={it.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Description"
                        />
                        <div className="flex items-center gap-2">
                            <Input
                                className="w-20"
                                inputMode="decimal"
                                value={it.qty}
                                onChange={(e) => updateItem(idx, { qty: e.target.value })}
                                placeholder="Qty"
                            />
                            <Input
                                className="flex-1"
                                inputMode="decimal"
                                value={it.unitPrice}
                                onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                                placeholder="Unit price"
                            />
                            <span className="w-24 shrink-0 text-right text-sm font-medium text-foreground">
                                {formatZar((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}
                            </span>
                            {items.length > 1 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeItem(idx)}
                                >
                                    Remove
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={addItem}
                >
                    Add Line Item
                </Button>
            </div>

            <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">{formatZar(totals.subtotal)}</span>
                </div>
                {data.vatRegistered && (
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">VAT (15%)</span>
                        <span className="text-foreground">{formatZar(totals.vat)}</span>
                    </div>
                )}
                <Separator className="my-1" />
                <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Total</span>
                    <span className="text-base font-semibold text-foreground">
                        {formatZar(totals.total)}
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                    <Label htmlFor="due-date">Due Date</Label>
                    <Input
                        id="due-date"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="deposit">Deposit Percent</Label>
                    <Input
                        id="deposit"
                        inputMode="decimal"
                        value={depositPercent}
                        onChange={(e) => setDepositPercent(e.target.value)}
                        placeholder="0"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="terms">Terms</Label>
                    <Textarea
                        id="terms"
                        value={terms}
                        onChange={(e) => setTerms(e.target.value)}
                        rows={3}
                        placeholder="Payment terms, banking details, notes"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    onClick={() => void save()}
                    disabled={saving || issuing}
                >
                    {saving ? 'Saving…' : 'Save Draft'}
                </Button>
                <Button onClick={() => setConfirmIssue(true)} disabled={saving || issuing}>
                    Issue Invoice
                </Button>
            </div>

            <Dialog open={confirmIssue} onOpenChange={setConfirmIssue}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Issue This Invoice?</DialogTitle>
                        <DialogDescription>
                            Issuing assigns a permanent invoice number and locks the invoice.
                            Once issued it cannot be edited; corrections need a credit note.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmIssue(false)}
                            disabled={issuing}
                        >
                            Cancel
                        </Button>
                        <Button onClick={() => void issue()} disabled={issuing}>
                            {issuing ? 'Issuing…' : 'Issue Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
