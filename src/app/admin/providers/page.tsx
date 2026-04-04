'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getAppOrigin } from '@/lib/site-url';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AdminPageHeader } from '../_components/admin-page-header';
import { AdminDataTable } from '../_components/admin-data-table';
import { TableCell, TableRow } from '@/components/ui/table';

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'new' | 'contacted' | 'approved' | 'rejected';

type ProviderApplication = {
    id: string;
    created_at: string;
    contact_name: string;
    business_name: string | null;
    trade: string;
    phone: string;
    email: string;
    areas: string;
    founded_year: number | null;
    status: Status;
    notes: string | null;
    sendgrid_sent_at: string | null;
    source: string | null;
};

type LiveProviderRow = {
    id: string;
    name: string;
    address: string | null;
    rating: number | null;
    rating_count: number;
    output_count: number;
    contact_count: number;
    profile_view_count: number;
    avg_output_position: number | null;
};

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Status, string> = {
    new:       'bg-blue-100 text-blue-700 border-blue-200',
    contacted: 'bg-amber-100 text-amber-700 border-amber-200',
    approved:  'bg-green-100 text-green-700 border-green-200',
    rejected:  'bg-red-100 text-red-600 border-red-200',
};
const STATUSES: Status[] = ['new', 'contacted', 'approved', 'rejected'];

function StatusBadge({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
            >
                {status}
                <svg className="h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
            {open && (
                <div className="absolute left-0 top-full z-20 mt-1 min-w-[110px] rounded-lg border border-border bg-background p-1 shadow-md">
                    {STATUSES.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => { onChange(s); setOpen(false); }}
                            className={`flex w-full items-center rounded-md px-2 py-1 text-left text-xs capitalize transition-colors hover:bg-muted ${s === status ? 'font-medium' : ''}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Email templates ───────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
    {
        id: 'waitlist',
        label: 'Application confirmation',
        subject: 'We received your Scandio application',
        body: (name: string) =>
            `Hi ${name},\n\nThank you for applying to join the Scandio contractor network. We have received your application and we’ll be in touch within 2 business days.\n\nIf you have any questions, you can reply directly to this email.\n\nKind regards,\nThe Scandio Team`,
    },
    {
        id: 'invitation',
        label: 'Invitation to join',
        subject: 'Your Scandio network invitation is ready',
        body: (name: string) =>
            `Hi ${name},\n\nGreat news — the Scandio contractor network is now open and your profile is ready to set up.\n\nAs a founding member you are locked in at the best available rate, and you will receive priority placement when paid tiers launch in late 2026.\n\nTo get started, complete your profile here: ${getAppOrigin()}/pro/onboard\n\nIf you have any questions, just reply to this email.\n\nKind regards,\nThe Scandio Team`,
    },
    {
        id: 'followup',
        label: 'Follow up',
        subject: 'Checking in — Scandio provider network',
        body: (name: string) =>
            `Hi ${name},\n\nI wanted to follow up on your Scandio application. We would love to have you in the founding network — the onboarding process takes just a few minutes.\n\nIf you have any questions or concerns, feel free to reply directly to this email.\n\nKind regards,\nThe Scandio Team`,
    },
] as const;

// ── Inline notes editor ───────────────────────────────────────────────────────

function NotesCell({ id, initial, onSaved }: { id: string; initial: string | null; onSaved: (v: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(initial ?? '');
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

    async function save() {
        setEditing(false);
        if (value === (initial ?? '')) return;
        const res = await fetch('/api/admin/providers', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, notes: value }),
        });
        if (res.ok) onSaved(value);
        else toast.error('Failed to save note');
    }

    if (editing) {
        return (
            <textarea
                ref={ref}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => void save()}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save(); } }}
                rows={2}
                className="w-full rounded border border-border bg-background p-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
        );
    }

    return (
        <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full rounded p-1 text-left text-xs text-muted-foreground hover:bg-muted/50 min-h-[24px]"
        >
            {value || <span className="italic opacity-50">Add note</span>}
        </button>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FILTER_STATUSES = ['all', ...STATUSES] as const;
type FilterStatus = (typeof FILTER_STATUSES)[number];

export default function AdminProvidersPage() {
    const [entries, setEntries] = useState<ProviderApplication[]>([]);
    const [liveProviders, setLiveProviders] = useState<LiveProviderRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [liveLoading, setLiveLoading] = useState(true);
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [search, setSearch] = useState('');
    const [emailTarget, setEmailTarget] = useState<ProviderApplication | null>(null);
    const [emailTemplate, setEmailTemplate] = useState(EMAIL_TEMPLATES[0].id);
    const [emailBody, setEmailBody] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        const [applicationsRes, liveProvidersRes] = await Promise.all([
            fetch('/api/admin/providers'),
            fetch('/api/admin/providers/live'),
        ]);
        if (applicationsRes.ok) setEntries(await applicationsRes.json());
        if (liveProvidersRes.ok) setLiveProviders(await liveProvidersRes.json());
        setLoading(false);
        setLiveLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Sync template into email body when template or target changes.
    useEffect(() => {
        if (!emailTarget) return;
        const tpl = EMAIL_TEMPLATES.find((t) => t.id === emailTemplate);
        if (!tpl) return;
        setEmailBody(tpl.body(emailTarget.contact_name));
        setEmailSubject(tpl.subject);
    }, [emailTemplate, emailTarget]);

    async function updateStatus(id: string, status: Status) {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
        const res = await fetch('/api/admin/providers', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        if (!res.ok) { toast.error('Failed to update status'); void load(); }
    }

    async function handleSendEmail() {
        if (!emailTarget) return;
        setSending(true);
        try {
            const res = await fetch('/api/admin/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: emailTarget.id,
                    email: emailTarget.email,
                    name: emailTarget.contact_name,
                    subject: emailSubject,
                    body: emailBody,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                toast.error((d as any)?.error || 'Failed to send email');
                return;
            }
            setEntries((prev) =>
                prev.map((e) =>
                    e.id === emailTarget.id
                        ? { ...e, sendgrid_sent_at: new Date().toISOString() }
                        : e
                )
            );
            toast.success(`Email sent to ${emailTarget.email}`);
            setEmailTarget(null);
        } finally {
            setSending(false);
        }
    }

    // Counts for filter bar
    const counts: Record<FilterStatus, number> = {
        all: entries.length,
        new: entries.filter((e) => e.status === 'new').length,
        contacted: entries.filter((e) => e.status === 'contacted').length,
        approved: entries.filter((e) => e.status === 'approved').length,
        rejected: entries.filter((e) => e.status === 'rejected').length,
    };

    const q = search.toLowerCase();
    const filtered = entries.filter((e) => {
        if (filter !== 'all' && e.status !== filter) return false;
        if (!q) return true;
        return (
            e.contact_name.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            (e.business_name ?? '').toLowerCase().includes(q) ||
            e.trade.toLowerCase().includes(q)
        );
    });
    const liveFiltered = liveProviders.filter((p) => {
        if (!q) return true;
        return (
            p.name.toLowerCase().includes(q) ||
            (p.address ?? '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader title="Providers" />
            </div>

            {/* Filter bar */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap gap-1">
                    {FILTER_STATUSES.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setFilter(s)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                                filter === s
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                        >
                            {s} <span className="opacity-60">({counts[s]})</span>
                        </button>
                    ))}
                </div>
                <Input
                    placeholder="Search name, email, trade…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 max-w-xs text-sm"
                />
            </div>

            <div className="mb-8 flex flex-col gap-3">
                <h2 className="text-base font-semibold text-foreground">Live Providers (Shown To Users)</h2>
                <AdminDataTable
                    headers={['Provider', 'Address', 'Rating', 'Outputs', 'Contacts', 'Profile Views', 'Avg Position']}
                    loading={liveLoading}
                    emptyText="No live providers found."
                >
                    {liveFiltered.map((p) => (
                        <TableRow key={p.id}>
                            <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                            <TableCell className="max-w-[260px] text-muted-foreground">{p.address ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">
                                {p.rating != null ? `${p.rating.toFixed(1)} (${p.rating_count})` : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{p.output_count}</TableCell>
                            <TableCell className="text-muted-foreground">{p.contact_count}</TableCell>
                            <TableCell className="text-muted-foreground">{p.profile_view_count}</TableCell>
                            <TableCell className="text-muted-foreground">
                                {p.avg_output_position != null ? p.avg_output_position.toFixed(2) : 'Not tracked yet'}
                            </TableCell>
                        </TableRow>
                    ))}
                </AdminDataTable>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-foreground">Provider Applications</h2>
                <AdminDataTable
                    headers={['Date', 'Contact', 'Business', 'Trade', 'Areas', 'Phone', 'Email', 'Founded', 'Status', 'Notes', 'Actions']}
                    loading={loading}
                    emptyText="No entries found."
                    colSpan={11}
                >
                    {filtered.map((e) => (
                        <TableRow key={e.id}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {new Date(e.created_at).toLocaleDateString('en-ZA', {
                                    day: 'numeric',
                                    month: 'short',
                                })}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">{e.contact_name}</TableCell>
                            <TableCell className="text-muted-foreground">{e.business_name ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">{e.trade}</TableCell>
                            <TableCell className="max-w-[140px] text-muted-foreground">
                                <span className="line-clamp-2 text-xs">{e.areas}</span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">{e.phone}</TableCell>
                            <TableCell className="text-muted-foreground">
                                <a href={`mailto:${e.email}`} className="hover:underline">
                                    {e.email}
                                </a>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">{e.founded_year ?? '—'}</TableCell>
                            <TableCell><StatusBadge status={e.status} onChange={(s) => void updateStatus(e.id, s)} /></TableCell>
                            <TableCell className="min-w-[160px]">
                                <NotesCell
                                    id={e.id}
                                    initial={e.notes}
                                    onSaved={(v) =>
                                        setEntries((prev) =>
                                            prev.map((x) => (x.id === e.id ? { ...x, notes: v } : x))
                                        )
                                    }
                                />
                            </TableCell>
                            <TableCell>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                        setEmailTarget(e);
                                        setEmailTemplate('waitlist');
                                    }}
                                >
                                    Email
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </AdminDataTable>
            </div>

            {/* Email modal */}
            <Dialog open={!!emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Send Email</DialogTitle>
                    </DialogHeader>
                    {emailTarget && (
                        <div className="flex flex-col gap-4">
                            {/* Recipient */}
                            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
                                <p className="font-medium text-foreground">{emailTarget.contact_name}</p>
                                <p className="text-muted-foreground">{emailTarget.email}</p>
                                <p className="text-xs text-muted-foreground">{emailTarget.trade}</p>
                            </div>

                            {/* Template selector */}
                            <div className="flex flex-col gap-1.5">
                                <Label>Template</Label>
                                <Select
                                    value={emailTemplate}
                                    onValueChange={(v) => setEmailTemplate(v as typeof emailTemplate)}
                                >
                                    <SelectTrigger className="h-9 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EMAIL_TEMPLATES.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Subject */}
                            <div className="flex flex-col gap-1.5">
                                <Label>Subject</Label>
                                <Input
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>

                            {/* Body */}
                            <div className="flex flex-col gap-1.5">
                                <Label>Message</Label>
                                <Textarea
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                    rows={8}
                                    className="text-sm"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={() => void handleSendEmail()}
                                    disabled={sending || !emailBody || !emailSubject}
                                    className="flex-1"
                                >
                                    {sending ? 'Sending…' : 'Send Email'}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setEmailTarget(null)}
                                    disabled={sending}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
