'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { type JobStatus, JOB_STATUS_LABEL } from '../client';

export type JobDetail = {
    id: string;
    title: string;
    siteAddress: string;
    status: JobStatus;
    scheduledDate: string;
    customerName: string | null;
    contactEventId: string | null;
};

const STATUS_OPTIONS: JobStatus[] = ['scheduled', 'in_progress', 'completed', 'cancelled'];

export default function JobDetailClient({ detail }: { detail: JobDetail }) {
    const [form, setForm] = useState(detail);
    const [saved, setSaved] = useState(detail);
    const [saving, setSaving] = useState(false);

    const dirty =
        form.title !== saved.title ||
        form.siteAddress !== saved.siteAddress ||
        form.scheduledDate !== saved.scheduledDate;

    const patch = async (body: Record<string, unknown>): Promise<boolean> => {
        const res = await fetch(`/api/pro/jobs/${detail.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).catch(() => null);
        return Boolean(res && res.ok);
    };

    const save = async () => {
        if (saving || !dirty) return;
        setSaving(true);
        const ok = await patch({
            title: form.title,
            site_address: form.siteAddress,
            scheduled_for: form.scheduledDate || null,
        });
        setSaving(false);
        if (ok) {
            setSaved(form);
            toast.success('Job saved.');
        } else {
            toast.error('Could not save. Please try again.');
        }
    };

    const setStatus = async (status: JobStatus) => {
        const prev = form.status;
        setForm((f) => ({ ...f, status }));
        setSaved((s) => ({ ...s, status }));
        if (!(await patch({ status }))) {
            setForm((f) => ({ ...f, status: prev }));
            setSaved((s) => ({ ...s, status: prev }));
            toast.error('Could not update status.');
        }
    };

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">{saved.title || 'Job'}</h1>
                {saved.customerName ? (
                    <p className="text-sm text-muted-foreground">{saved.customerName}</p>
                ) : null}
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="job-status">Status</Label>
                    <Select value={form.status} onValueChange={(v) => void setStatus(v as JobStatus)}>
                        <SelectTrigger id="job-status" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {JOB_STATUS_LABEL[s]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="job-title">Title</Label>
                    <Input
                        id="job-title"
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="job-address">Site Address</Label>
                    <Input
                        id="job-address"
                        value={form.siteAddress}
                        onChange={(e) => setForm((f) => ({ ...f, siteAddress: e.target.value }))}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="job-date">Scheduled Date</Label>
                    <Input
                        id="job-date"
                        type="date"
                        value={form.scheduledDate}
                        onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                    />
                </div>
                <Button
                    variant="secondary"
                    className="w-fit"
                    disabled={saving || !dirty}
                    onClick={() => void save()}
                >
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>

            {detail.contactEventId ? (
                <Link
                    href={`/pro/leads/${detail.contactEventId}`}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    View original lead
                </Link>
            ) : null}
        </>
    );
}
