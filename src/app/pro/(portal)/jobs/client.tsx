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

export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type JobRow = {
    id: string;
    title: string;
    siteAddress: string | null;
    status: JobStatus;
    scheduledFor: string | null;
    customerName: string | null;
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

function formatScheduled(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function JobsClient({ rows }: { rows: JobRow[] }) {
    const [items, setItems] = useState<JobRow[]>(rows);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ title: '', site_address: '', scheduled_for: '' });

    const add = async () => {
        if (saving || !form.title.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/pro/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const json = (await res.json().catch(() => null)) as
                | { job?: { id: string; title: string | null; site_address: string | null; status: JobStatus; scheduled_for: string | null }; error?: string }
                | null;
            if (!res.ok || !json?.job) {
                toast.error(json?.error ?? 'Could not add job.');
                return;
            }
            setItems((r) => [
                {
                    id: json.job!.id,
                    title: json.job!.title ?? 'Job',
                    siteAddress: json.job!.site_address,
                    status: json.job!.status,
                    scheduledFor: json.job!.scheduled_for,
                    customerName: null,
                },
                ...r,
            ]);
            setForm({ title: '', site_address: '', scheduled_for: '' });
            setOpen(false);
            toast.success('Job created.');
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
                    <h1 className="text-2xl font-semibold text-foreground">Jobs</h1>
                    <p className="text-sm text-muted-foreground">
                        Work you have won. Won leads land here automatically.
                    </p>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
                    Add
                </Button>
            </div>

            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
                <div className="flex flex-col">
                    {items.map((j, i) => {
                        const meta = [j.customerName, j.siteAddress].filter(Boolean).join(' · ');
                        return (
                            <Fragment key={j.id}>
                                {i > 0 && <Separator />}
                                <Link href={`/pro/jobs/${j.id}`} className="flex items-center gap-3 py-3">
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {j.title}
                                        </p>
                                        {meta ? (
                                            <p className="truncate text-xs text-muted-foreground">{meta}</p>
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                                        <span className="text-xs font-medium text-foreground">
                                            {JOB_STATUS_LABEL[j.status]}
                                        </span>
                                        {j.scheduledFor ? (
                                            <span className="text-xs text-muted-foreground">
                                                {formatScheduled(j.scheduledFor)}
                                            </span>
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
                        <DialogTitle>Add Job</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
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
                                value={form.site_address}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, site_address: e.target.value }))
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="job-date">Scheduled Date</Label>
                            <Input
                                id="job-date"
                                type="date"
                                value={form.scheduled_for}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, scheduled_for: e.target.value }))
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button disabled={saving || !form.title.trim()} onClick={() => void add()}>
                            {saving ? 'Saving…' : 'Add Job'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
