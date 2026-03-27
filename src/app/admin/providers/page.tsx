'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'new' | 'contacted' | 'approved' | 'rejected';

type WaitlistEntry = {
    id: string;
    created_at: string;
    name: string;
    business_name: string | null;
    trade: string;
    phone: string;
    email: string;
    areas: string;
    years_experience: number | null;
    message: string | null;
    status: Status;
    notes: string | null;
    sendgrid_sent_at: string | null;
    source: string | null;
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
        label: 'Waitlist confirmation',
        subject: 'You are on the Scandio provider waitlist',
        body: (name: string) =>
            `Hi ${name},\n\nThank you for applying to join the Scandio contractor network. We have received your application and are excited to have you with us.\n\nScandio is building the Western Cape's founding contractor network, connecting informed homeowners with trusted local professionals. We will be in touch before we open the network to providers — you will be among the first to know.\n\nIn the meantime, if you have any questions, feel free to reply to this email.\n\nKind regards,\nThe Scandio Team`,
    },
    {
        id: 'invitation',
        label: 'Invitation to join',
        subject: 'Your Scandio network invitation is ready',
        body: (name: string) =>
            `Hi ${name},\n\nGreat news — the Scandio contractor network is now open and your profile is ready to set up.\n\nAs a founding member you are locked in at the best available rate, and you will receive priority placement when paid tiers launch in late 2026.\n\nTo get started, complete your profile here: https://scandio.app/pro/onboard\n\nIf you have any questions, just reply to this email.\n\nKind regards,\nThe Scandio Team`,
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
    const [entries, setEntries] = useState<WaitlistEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [search, setSearch] = useState('');
    const [emailTarget, setEmailTarget] = useState<WaitlistEntry | null>(null);
    const [emailTemplate, setEmailTemplate] = useState(EMAIL_TEMPLATES[0].id);
    const [emailBody, setEmailBody] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/providers');
        if (res.ok) setEntries(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Sync template into email body when template or target changes.
    useEffect(() => {
        if (!emailTarget) return;
        const tpl = EMAIL_TEMPLATES.find((t) => t.id === emailTemplate);
        if (!tpl) return;
        setEmailBody(tpl.body(emailTarget.name));
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
                    name: emailTarget.name,
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
            e.name.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            (e.business_name ?? '').toLowerCase().includes(q) ||
            e.trade.toLowerCase().includes(q)
        );
    });

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Provider Waitlist</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {entries.length} applicant{entries.length !== 1 ? 's' : ''} total
                    </p>
                </div>
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

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="min-w-full divide-y divide-border/50 text-sm">
                    <thead className="bg-muted/30">
                        <tr>
                            {['Date', 'Name', 'Business', 'Trade', 'Areas', 'Phone', 'Email', 'Exp.', 'Status', 'Notes', 'Actions'].map(
                                (h) => (
                                    <th
                                        key={h}
                                        className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground"
                                    >
                                        {h}
                                    </th>
                                )
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 bg-background">
                        {loading ? (
                            <tr>
                                <td colSpan={11} className="py-12 text-center text-sm text-muted-foreground">
                                    Loading…
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="py-12 text-center text-sm text-muted-foreground">
                                    No entries found.
                                </td>
                            </tr>
                        ) : (
                            filtered.map((e) => (
                                <tr key={e.id} className="hover:bg-muted/20">
                                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                                        {new Date(e.created_at).toLocaleDateString('en-ZA', {
                                            day: 'numeric',
                                            month: 'short',
                                        })}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-foreground">{e.name}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{e.business_name ?? '—'}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{e.trade}</td>
                                    <td className="max-w-[140px] px-3 py-2 text-muted-foreground">
                                        <span className="line-clamp-2 text-xs">{e.areas}</span>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{e.phone}</td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        <a href={`mailto:${e.email}`} className="hover:underline">
                                            {e.email}
                                        </a>
                                    </td>
                                    <td className="px-3 py-2 text-center text-muted-foreground">
                                        {e.years_experience ?? '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        <StatusBadge
                                            status={e.status}
                                            onChange={(s) => void updateStatus(e.id, s)}
                                        />
                                    </td>
                                    <td className="min-w-[160px] px-3 py-2">
                                        <NotesCell
                                            id={e.id}
                                            initial={e.notes}
                                            onSaved={(v) =>
                                                setEntries((prev) =>
                                                    prev.map((x) => (x.id === e.id ? { ...x, notes: v } : x))
                                                )
                                            }
                                        />
                                    </td>
                                    <td className="px-3 py-2">
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
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
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
                                <p className="font-medium text-foreground">{emailTarget.name}</p>
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
