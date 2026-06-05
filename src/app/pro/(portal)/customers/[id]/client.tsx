'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatRelativeDate } from '@/lib/format-date';

export type CustomerDetail = {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
};

export type CustomerLead = {
    id: string;
    createdAt: string;
    title: string;
    suburb: string;
};

export default function CustomerDetailClient({
    detail,
    leads,
}: {
    detail: CustomerDetail;
    leads: CustomerLead[];
}) {
    const [form, setForm] = useState(detail);
    const [saved, setSaved] = useState(detail);
    const [saving, setSaving] = useState(false);

    const dirty =
        form.name !== saved.name ||
        form.phone !== saved.phone ||
        form.email !== saved.email ||
        form.address !== saved.address;

    const save = async () => {
        if (saving || !dirty) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/pro/customers/${detail.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    phone: form.phone,
                    email: form.email,
                    address: form.address,
                }),
            });
            if (!res.ok) throw new Error();
            setSaved(form);
            toast.success('Customer saved.');
        } catch {
            toast.error('Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const field = (key: keyof CustomerDetail, label: string) => (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cust-${key}`}>{label}</Label>
            <Input
                id={`cust-${key}`}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
        </div>
    );

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">
                    {saved.name || 'Customer'}
                </h1>
                <p className="text-sm text-muted-foreground">Customer details and history.</p>
            </div>

            <div className="flex flex-col gap-3">
                {field('name', 'Name')}
                {field('phone', 'Phone')}
                {field('email', 'Email')}
                {field('address', 'Address')}
                <Button
                    variant="secondary"
                    className="w-fit"
                    disabled={saving || !dirty}
                    onClick={() => void save()}
                >
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground">History</h2>
                {leads.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No leads from this customer yet.</p>
                ) : (
                    <div className="flex flex-col">
                        {leads.map((l, i) => (
                            <Fragment key={l.id}>
                                {i > 0 && <Separator />}
                                <Link href={`/pro/leads/${l.id}`} className="flex items-center gap-3 py-3">
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {l.title}
                                        </p>
                                        {l.suburb ? (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {l.suburb}
                                            </p>
                                        ) : null}
                                    </div>
                                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                                        {formatRelativeDate(l.createdAt)}
                                    </span>
                                </Link>
                            </Fragment>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
