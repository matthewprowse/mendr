'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { formatZar } from '@/lib/format-money';
import { type QuoteStatus, QUOTE_STATUS_LABEL } from '../client';

type Item = { description: string; qty: string; unitPrice: string };

export type QuoteEditorData = {
    id: string;
    number: string;
    status: QuoteStatus;
    customerName: string | null;
    depositPercent: string;
    validUntil: string;
    terms: string;
    vatRegistered: boolean;
    items: Item[];
};

const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
};

export default function QuoteEditorClient({ data }: { data: QuoteEditorData }) {
    const [items, setItems] = useState<Item[]>(
        data.items.length > 0 ? data.items : [{ description: '', qty: '1', unitPrice: '0' }]
    );
    const [depositPercent, setDepositPercent] = useState(data.depositPercent);
    const [validUntil, setValidUntil] = useState(data.validUntil);
    const [terms, setTerms] = useState(data.terms);
    const [status, setStatus] = useState<QuoteStatus>(data.status);
    const [saving, setSaving] = useState(false);

    const totals = useMemo(() => {
        const subtotal = items.reduce((s, it) => s + num(it.qty) * num(it.unitPrice), 0);
        const vat = data.vatRegistered ? subtotal * 0.15 : 0;
        return { subtotal, vat, total: subtotal + vat };
    }, [items, data.vatRegistered]);

    const setItem = (i: number, key: keyof Item, value: string) =>
        setItems((list) => list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
    const addItem = () => setItems((l) => [...l, { description: '', qty: '1', unitPrice: '0' }]);
    const removeItem = (i: number) => setItems((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l));

    const save = async (extra?: { status?: QuoteStatus }) => {
        if (saving) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/pro/quotes/${data.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: items.map((it) => ({
                        description: it.description,
                        qty: num(it.qty),
                        unitPrice: num(it.unitPrice),
                    })),
                    depositPercent: depositPercent === '' ? null : num(depositPercent),
                    validUntil: validUntil || null,
                    terms,
                    ...(extra?.status ? { status: extra.status } : {}),
                }),
            });
            if (!res.ok) throw new Error();
            if (extra?.status) setStatus(extra.status);
            toast.success(extra?.status ? 'Quote updated.' : 'Quote saved.');
        } catch {
            toast.error('Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const shareUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/quote/${data.id}` : '';

    return (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Quote {data.number}</h1>
                    <p className="text-sm text-muted-foreground">
                        {QUOTE_STATUS_LABEL[status]}
                        {data.customerName ? ` · ${data.customerName}` : ''}
                    </p>
                </div>
            </div>

            {/* Line items */}
            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground">Line Items</h2>
                <div className="flex flex-col gap-2">
                    {items.map((it, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Input
                                className="min-w-0 flex-1"
                                placeholder="Description"
                                value={it.description}
                                onChange={(e) => setItem(i, 'description', e.target.value)}
                            />
                            <Input
                                className="w-14 shrink-0 text-center"
                                inputMode="decimal"
                                value={it.qty}
                                onChange={(e) => setItem(i, 'qty', e.target.value)}
                            />
                            <Input
                                className="w-24 shrink-0 text-right"
                                inputMode="decimal"
                                value={it.unitPrice}
                                onChange={(e) => setItem(i, 'unitPrice', e.target.value)}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                aria-label="Remove item"
                                onClick={() => removeItem(i)}
                            >
                                <X className="size-4" />
                            </Button>
                        </div>
                    ))}
                </div>
                <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={addItem}>
                    Add Item
                </Button>
            </div>

            {/* Totals */}
            <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">{formatZar(totals.subtotal)}</span>
                </div>
                {data.vatRegistered ? (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT (15%)</span>
                        <span className="text-foreground">{formatZar(totals.vat)}</span>
                    </div>
                ) : null}
                <div className="flex justify-between font-semibold">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">{formatZar(totals.total)}</span>
                </div>
            </div>

            {/* Terms / deposit / validity */}
            <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                    <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor="deposit">Deposit %</Label>
                        <Input
                            id="deposit"
                            inputMode="decimal"
                            value={depositPercent}
                            onChange={(e) => setDepositPercent(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor="valid">Valid Until</Label>
                        <Input
                            id="valid"
                            type="date"
                            value={validUntil}
                            onChange={(e) => setValidUntil(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="terms">Terms</Label>
                    <Textarea
                        id="terms"
                        rows={3}
                        value={terms}
                        onChange={(e) => setTerms(e.target.value)}
                    />
                </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                    <Button className="flex-1" disabled={saving} onClick={() => void save()}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                        className="flex-1"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void save({ status: 'sent' })}
                    >
                        Mark as Sent
                    </Button>
                </div>
                <div className="flex gap-2">
                    <Button
                        className="flex-1"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void save({ status: 'accepted' })}
                    >
                        Accepted
                    </Button>
                    <Button
                        className="flex-1"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void save({ status: 'declined' })}
                    >
                        Declined
                    </Button>
                </div>
                <a
                    href={`/quote/${data.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    Open printable quote
                </a>
                {shareUrl ? (
                    <button
                        type="button"
                        onClick={() => {
                            void navigator.clipboard.writeText(shareUrl);
                            toast.success('Link copied.');
                        }}
                        className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                        Copy share link
                    </button>
                ) : null}
            </div>
        </>
    );
}
