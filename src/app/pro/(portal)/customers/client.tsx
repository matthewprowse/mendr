'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export type CustomerRow = {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    created_at: string;
};

export default function CustomersClient({ customers }: { customers: CustomerRow[] }) {
    const [rows, setRows] = useState<CustomerRow[]>(customers);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });

    const add = async () => {
        if (saving || !form.name.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/pro/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const json = (await res.json().catch(() => null)) as
                | { customer?: CustomerRow; error?: string }
                | null;
            if (!res.ok || !json?.customer) {
                toast.error(json?.error ?? 'Could not add customer.');
                return;
            }
            setRows((r) => [json.customer as CustomerRow, ...r]);
            setForm({ name: '', phone: '', email: '', address: '' });
            setOpen(false);
            toast.success('Customer added.');
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
                    <p className="text-sm text-muted-foreground">
                        Everyone you have worked with, built up from your leads.
                    </p>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
                    Add
                </Button>
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No customers yet.</p>
            ) : (
                <div className="flex flex-col">
                    {rows.map((c, i) => {
                        const meta = [c.phone, c.email].filter(Boolean).join(' · ');
                        return (
                            <Fragment key={c.id}>
                                {i > 0 && <Separator />}
                                <Link
                                    href={`/pro/customers/${c.id}`}
                                    className="flex items-center gap-3 py-3"
                                >
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {c.name || 'Customer'}
                                        </p>
                                        {meta ? (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {meta}
                                            </p>
                                        ) : null}
                                    </div>
                                </Link>
                            </Fragment>
                        );
                    })}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Add Customer</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cust-name">Name</Label>
                            <Input
                                id="cust-name"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cust-phone">Phone</Label>
                            <Input
                                id="cust-phone"
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cust-email">Email</Label>
                            <Input
                                id="cust-email"
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cust-address">Address</Label>
                            <Input
                                id="cust-address"
                                value={form.address}
                                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button disabled={saving || !form.name.trim()} onClick={() => void add()}>
                            {saving ? 'Saving…' : 'Add Customer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
