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
    DialogDescription,
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
import { AdminDataTable } from '../components/data-table';
import { TableCell, TableRow } from '@/components/ui/table';

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'new' | 'contacted' | 'approved' | 'rejected';

type ConfirmEmailStatus = 'pending' | 'sent' | 'failed';
type EnrichmentStatus  = 'pending' | 'queued' | 'running' | 'matched' | 'no_match' | 'failed' | 'complete';
type InviteEmailStatus = 'pending' | 'sent' | 'failed' | null;

type ProviderApplication = {
    id: string;
    created_at: string;
    contact_name: string;
    business_name: string | null;
    trade: string;
    trade_description: string | null;
    phone: string;
    email: string;
    address: string | null;
    areas: string;
    founded_year: number | null;
    website: string | null;
    whatsapp_available: boolean | null;
    registration_number: string | null;
    certifications: string | null;
    highlights: string | null;
    referral: string | null;
    team_size: number | null;
    status: Status;
    notes: string | null;
    sendgrid_sent_at: string | null;
    source: string | null;
    // Pipeline fields
    confirmation_email_status:  ConfirmEmailStatus | null;
    confirmation_email_error:   string | null;
    enrichment_status:          EnrichmentStatus | null;
    enrichment_error:           string | null;
    matched_provider_id:        string | null;
    match_score:                number | null;
    gemini_summary:             string | null;
    applicant_summary:          string | null;
    invitation_email_status:    InviteEmailStatus;
    invitation_email_error:     string | null;
};

type RawProviderApplication = Omit<ProviderApplication, 'status'> & {
    status?: unknown;
};

type LiveProviderRow = {
    id: string;
    name: string;
    address: string | null;
    rating: number | null;
    rating_count: number;
    google_place_id: string | null;
    /** Customer-facing review summary (short). */
    summary: string;
    /** Long profile narrative shown under About → Summary when present. */
    summary_long: string;
    about: string;
    past_work: string;
    specialisations: string[];
    highlights: string[];
    key_person: string;
    /** Free-text certification labels stored in providers.certifications (text[]). */
    certifications: string[];
    enrichment_review_required: boolean;
    enrichment_last_failure: string | null;
    enrichment_last_failure_at: string | null;
    /** Times surfaced to users — not tracked per provider yet (null). */
    output_count: number | null;
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

const STATUS_ALIASES: Record<string, Status> = {
    pending: 'new',
    waitlist: 'new',
    invited: 'contacted',
    invitation_sent: 'contacted',
    accepted: 'approved',
    declined: 'rejected',
    denied: 'rejected',
};

function normalizeStatus(value: unknown): Status {
    if (typeof value !== 'string') return 'new';
    const normalized = value.trim().toLowerCase();
    if (STATUSES.includes(normalized as Status)) return normalized as Status;
    return STATUS_ALIASES[normalized] ?? 'new';
}

function normalizeApplication(row: RawProviderApplication): ProviderApplication {
    return {
        ...row,
        status: normalizeStatus(row.status),
    };
}

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
        subject: 'We received your Menda application',
        body: (name: string) =>
            `Hi ${name},\n\nThank you for applying to join the Menda contractor network. We have received your application and we’ll be in touch within 2 business days.\n\nIf you have any questions, you can reply directly to this email.\n\nKind regards,\nThe Menda Team`,
    },
    {
        id: 'invitation',
        label: 'Invitation to join',
        subject: 'Your Menda network invitation is ready',
        body: (name: string) =>
            `Hi ${name},\n\nGreat news — the Menda contractor network is now open and your profile is ready to set up.\n\nAs a founding member you are locked in at the best available rate, and you will receive priority placement when paid tiers launch in late 2026.\n\nTo get started, complete your profile here: ${getAppOrigin()}/contractors/network\n\nIf you have any questions, just reply to this email.\n\nKind regards,\nThe Menda Team`,
    },
    {
        id: 'followup',
        label: 'Follow up',
        subject: 'Checking in — Menda provider network',
        body: (name: string) =>
            `Hi ${name},\n\nI wanted to follow up on your Menda application. We would love to have you in the founding network — the onboarding process takes just a few minutes.\n\nIf you have any questions or concerns, feel free to reply directly to this email.\n\nKind regards,\nThe Menda Team`,
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
    const [applicationsPage, setApplicationsPage] = useState(0);
    const [livePage, setLivePage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    const [selectedApplication, setSelectedApplication] = useState<ProviderApplication | null>(null);
    const [editApplication, setEditApplication] = useState<ProviderApplication | null>(null);
    const [selectedLiveProvider, setSelectedLiveProvider] = useState<LiveProviderRow | null>(null);
    const [editLiveProvider, setEditLiveProvider] = useState<LiveProviderRow | null>(null);
    const [refreshingGoogle, setRefreshingGoogle] = useState(false);
    const [resendingConfirmation, setResendingConfirmation] = useState<string | null>(null);
    const [sendingInvitation, setSendingInvitation] = useState<string | null>(null);
    const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

    const load = useCallback(async () => {
        const [applicationsRes, liveProvidersRes] = await Promise.all([
            fetch('/api/admin/providers'),
            fetch('/api/admin/providers/live'),
        ]);
        if (applicationsRes.ok) {
            const rows = await applicationsRes.json();
            const safeRows = Array.isArray(rows) ? (rows as RawProviderApplication[]) : [];
            setEntries(safeRows.map(normalizeApplication));
        }
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
        if (needsReviewOnly && !p.enrichment_review_required) return false;
        if (!q) return true;
        return (
            p.name.toLowerCase().includes(q) ||
            (p.address ?? '').toLowerCase().includes(q)
        );
    });
    const needsReviewCount = liveProviders.filter((p) => p.enrichment_review_required).length;
    const applicationsTotalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const applicationsPageRows = filtered.slice(applicationsPage * pageSize, (applicationsPage + 1) * pageSize);
    const liveTotalPages = Math.max(1, Math.ceil(liveFiltered.length / pageSize));
    const livePageRows = liveFiltered.slice(livePage * pageSize, (livePage + 1) * pageSize);
    async function saveApplicationEdit() {
        if (!editApplication) return;
        const res = await fetch('/api/admin/providers', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id:                  editApplication.id,
                contact_name:        editApplication.contact_name,
                business_name:       editApplication.business_name,
                trade:               editApplication.trade,
                trade_description:   editApplication.trade_description,
                phone:               editApplication.phone,
                email:               editApplication.email,
                address:             editApplication.address,
                areas:               editApplication.areas,
                founded_year:        editApplication.founded_year,
                website:             editApplication.website,
                whatsapp_available:  editApplication.whatsapp_available,
                registration_number: editApplication.registration_number,
                certifications:      editApplication.certifications,
                highlights:          editApplication.highlights,
                referral:            editApplication.referral,
                team_size:           editApplication.team_size,
                status:              editApplication.status,
                notes:               editApplication.notes,
            }),
        });
        if (!res.ok) {
            toast.error('Failed to save provider application');
            return;
        }
        setEntries((prev) => prev.map((r) => (r.id === editApplication.id ? { ...r, ...editApplication } : r)));
        setSelectedApplication((prev) => (prev?.id === editApplication.id ? { ...prev, ...editApplication } : prev));
        setEditApplication(null);
        toast.success('Provider application updated');
    }
    async function saveLiveProviderEdit() {
        if (!editLiveProvider) return;
        const res = await fetch('/api/admin/providers/live', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editLiveProvider.id,
                name: editLiveProvider.name,
                address: editLiveProvider.address ?? '',
                rating: editLiveProvider.rating ?? null,
                rating_count: editLiveProvider.rating_count ?? 0,
                summary: editLiveProvider.summary,
                summary_long: editLiveProvider.summary_long,
                about: editLiveProvider.about,
                past_work: editLiveProvider.past_work,
                key_person: editLiveProvider.key_person,
                specialisations: editLiveProvider.specialisations,
                highlights: editLiveProvider.highlights,
                certifications: editLiveProvider.certifications,
            }),
        });
        if (!res.ok) {
            toast.error('Failed to save live provider');
            return;
        }
        const patched: LiveProviderRow = { ...editLiveProvider };
        setLiveProviders((prev) => prev.map((r) => (r.id === patched.id ? patched : r)));
        setSelectedLiveProvider((prev) => (prev?.id === patched.id ? patched : prev));
        setEditLiveProvider(null);
        toast.success('Live provider updated');
    }

    async function resendConfirmation(id: string) {
        setResendingConfirmation(id);
        try {
            const res = await fetch('/api/admin/provider-applications/resend-confirmation', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ id }),
            });
            const d = await res.json().catch(() => ({})) as { error?: string };
            if (!res.ok) { toast.error(d.error || 'Failed to resend'); return; }
            setEntries((prev) =>
                prev.map((e) => e.id === id
                    ? { ...e, confirmation_email_status: 'sent', confirmation_email_error: null, confirmation_email_sent_at: new Date().toISOString() } as any
                    : e
                )
            );
            toast.success('Confirmation email resent');
        } finally {
            setResendingConfirmation(null);
        }
    }

    async function sendInvitation(id: string) {
        setSendingInvitation(id);
        try {
            const res = await fetch('/api/admin/provider-applications/send-invitation', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ id }),
            });
            const d = await res.json().catch(() => ({})) as { error?: string };
            if (!res.ok) { toast.error(d.error || 'Failed to send invitation'); return; }
            setEntries((prev) =>
                prev.map((e) => e.id === id
                    ? { ...e, invitation_email_status: 'sent', invitation_email_error: null } as any
                    : e
                )
            );
            if (selectedApplication?.id === id) {
                setSelectedApplication((prev) => prev ? { ...prev, invitation_email_status: 'sent' } : prev);
            }
            toast.success('Invitation email sent');
        } finally {
            setSendingInvitation(null);
        }
    }

    async function refreshRatingsFromGoogle() {
        if (!selectedLiveProvider?.google_place_id) {
            toast.error('No Google place id on this provider');
            return;
        }
        setRefreshingGoogle(true);
        try {
            const res = await fetch('/api/admin/providers/live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedLiveProvider.id }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                rating?: number | null;
                rating_count?: number;
                name?: string | null;
                address?: string | null;
                summary?: string;
            };
            if (!res.ok) {
                toast.error(data.error || 'Could not refresh from Google');
                return;
            }
            const patch = {
                rating: data.rating ?? null,
                rating_count: typeof data.rating_count === 'number' ? data.rating_count : 0,
                ...(typeof data.name === 'string' ? { name: data.name } : {}),
                ...(typeof data.address === 'string' ? { address: data.address } : {}),
                ...(typeof data.summary === 'string' ? { summary: data.summary } : {}),
            };
            setLiveProviders((prev) =>
                prev.map((r) => (r.id === selectedLiveProvider.id ? { ...r, ...patch } : r))
            );
            setSelectedLiveProvider((prev) => (prev?.id === selectedLiveProvider.id ? { ...prev, ...patch } : prev));
            toast.success('Rating and review count updated from Google');
        } finally {
            setRefreshingGoogle(false);
        }
    }

    async function requeueEnrichment(provider: LiveProviderRow) {
        const placeId = provider.google_place_id;
        if (!placeId) {
            toast.error('No Google place id on this provider; cannot re-enrich');
            return;
        }
        try {
            const res = await fetch('/api/enrich/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priorityPlaceId: placeId,
                    mode: 'full',
                    reason: 'admin_review',
                }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                toast.error(data.error || 'Could not queue re-enrichment');
                return;
            }
            toast.success('Re-enrichment queued');
        } catch {
            toast.error('Could not queue re-enrichment');
        }
    }

    function linesToList(text: string): string[] {
        return text
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    async function copyToClipboard(value: string, label: string) {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
        } catch {
            toast.error(`Failed to copy ${label.toLowerCase()}`);
        }
    }

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-foreground">Live Providers (Shown To Users)</h2>
                    <button
                        type="button"
                        onClick={() => {
                            setNeedsReviewOnly((v) => !v);
                            setLivePage(0);
                        }}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            needsReviewOnly
                                ? 'border-amber-300 bg-amber-100 text-amber-800'
                                : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                        title="Show only providers whose AI enrichment failed the leak gate after retries"
                    >
                        <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                                needsReviewCount > 0 ? 'bg-amber-500' : 'bg-muted-foreground/40'
                            }`}
                            aria-hidden
                        />
                        Needs review
                        <span className="opacity-70">({needsReviewCount})</span>
                    </button>
                </div>
                <AdminDataTable
                    headers={['Provider', 'Address', 'Rating', 'Review', 'Outputs', 'Contacts', 'Profile Views', 'Avg Position']}
                    loading={liveLoading}
                    emptyText="No live providers found."
                >
                    {livePageRows.map((p) => (
                        <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelectedLiveProvider(p)}>
                            <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                            <TableCell className="max-w-[260px] text-muted-foreground">{p.address ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">
                                {p.rating != null ? `${p.rating.toFixed(1)} (${p.rating_count})` : '—'}
                            </TableCell>
                            <TableCell>
                                {p.enrichment_review_required ? (
                                    <span
                                        className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800"
                                        title={p.enrichment_last_failure ?? 'Enrichment failed leak gate'}
                                    >
                                        Needs review
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{p.output_count ?? 'Not tracked yet'}</TableCell>
                            <TableCell className="text-muted-foreground">{p.contact_count}</TableCell>
                            <TableCell className="text-muted-foreground">{p.profile_view_count}</TableCell>
                            <TableCell className="text-muted-foreground">
                                {p.avg_output_position != null ? p.avg_output_position.toFixed(2) : 'Not tracked yet'}
                            </TableCell>
                        </TableRow>
                    ))}
                </AdminDataTable>
                {liveTotalPages > 1 ? (
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <div className="mr-2 flex items-center gap-2">
                            <Label htmlFor="providers-page-size-live" className="text-xs text-muted-foreground">Rows</Label>
                            <Input
                                id="providers-page-size-live"
                                type="number"
                                min={1}
                                value={pageSize}
                                onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (!Number.isFinite(next)) return;
                                    const normalized = Math.max(1, Math.trunc(next));
                                    setPageSize(normalized);
                                    setLivePage(0);
                                    setApplicationsPage(0);
                                }}
                                className="h-8 w-20 text-sm"
                            />
                        </div>
                        <Button size="sm" variant="outline" disabled={livePage === 0} onClick={() => setLivePage((p) => p - 1)}>Previous</Button>
                        <span className="text-xs text-muted-foreground">{livePage + 1} / {liveTotalPages}</span>
                        <Button size="sm" variant="outline" disabled={livePage >= liveTotalPages - 1} onClick={() => setLivePage((p) => p + 1)}>Next</Button>
                    </div>
                ) : null}
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-foreground">Provider Applications</h2>
                <AdminDataTable
                    headers={['Date', 'Contact', 'Business', 'Trade', 'Status', 'Confirm', 'Enrichment', 'Invite', 'Notes', 'Actions']}
                    loading={loading}
                    emptyText="No entries found."
                    colSpan={10}
                >
                    {applicationsPageRows.map((e) => {
                        const confirmStatus = e.confirmation_email_status;
                        const enrichStatus  = e.enrichment_status;
                        const inviteStatus  = e.invitation_email_status;
                        const hasMatch      = !!e.matched_provider_id;
                        const hasSummary    = !!(e.applicant_summary || e.gemini_summary);
                        return (
                            <TableRow key={e.id} className="cursor-pointer" onClick={() => setSelectedApplication(e)}>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                    {new Date(e.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                                </TableCell>
                                <TableCell className="font-medium text-foreground">{e.contact_name}</TableCell>
                                <TableCell className="text-muted-foreground">{e.business_name ?? '—'}</TableCell>
                                <TableCell className="text-muted-foreground">{e.trade}</TableCell>
                                <TableCell>
                                    <StatusBadge status={e.status} onChange={(s) => void updateStatus(e.id, s)} />
                                </TableCell>
                                {/* Confirmation email status */}
                                <TableCell>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                        confirmStatus === 'sent'   ? 'bg-green-100 text-green-700' :
                                        confirmStatus === 'failed' ? 'bg-red-100 text-red-600' :
                                        'bg-muted text-muted-foreground'
                                    }`} title={e.confirmation_email_error ?? undefined}>
                                        {confirmStatus ?? 'pending'}
                                    </span>
                                </TableCell>
                                {/* Enrichment status */}
                                <TableCell>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                        enrichStatus === 'complete'  ? 'bg-green-100 text-green-700' :
                                        enrichStatus === 'no_match'  ? 'bg-amber-100 text-amber-700' :
                                        enrichStatus === 'failed'    ? 'bg-red-100 text-red-600' :
                                        enrichStatus === 'running'   ? 'bg-blue-100 text-blue-700' :
                                        enrichStatus === 'queued'    ? 'bg-sky-100 text-sky-700' :
                                        'bg-muted text-muted-foreground'
                                    }`} title={e.enrichment_error ?? (hasMatch ? `Score: ${e.match_score?.toFixed(2)}` : undefined)}>
                                        {enrichStatus ?? 'pending'}
                                        {hasMatch && enrichStatus === 'complete' ? ' ✓' : ''}
                                    </span>
                                </TableCell>
                                {/* Invitation email status */}
                                <TableCell>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                        inviteStatus === 'sent'   ? 'bg-green-100 text-green-700' :
                                        inviteStatus === 'failed' ? 'bg-red-100 text-red-600' :
                                        hasSummary                ? 'bg-muted/50 text-muted-foreground' :
                                        'bg-muted text-muted-foreground'
                                    }`}>
                                        {inviteStatus ?? (hasSummary ? 'ready' : 'waiting')}
                                    </span>
                                </TableCell>
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
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            setEmailTarget(e);
                                            setEmailTemplate('waitlist');
                                        }}
                                    >
                                        Email
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </AdminDataTable>
                {applicationsTotalPages > 1 ? (
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <div className="mr-2 flex items-center gap-2">
                            <Label htmlFor="providers-page-size-applications" className="text-xs text-muted-foreground">Rows</Label>
                            <Input
                                id="providers-page-size-applications"
                                type="number"
                                min={1}
                                value={pageSize}
                                onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (!Number.isFinite(next)) return;
                                    const normalized = Math.max(1, Math.trunc(next));
                                    setPageSize(normalized);
                                    setLivePage(0);
                                    setApplicationsPage(0);
                                }}
                                className="h-8 w-20 text-sm"
                            />
                        </div>
                        <Button size="sm" variant="outline" disabled={applicationsPage === 0} onClick={() => setApplicationsPage((p) => p - 1)}>Previous</Button>
                        <span className="text-xs text-muted-foreground">{applicationsPage + 1} / {applicationsTotalPages}</span>
                        <Button size="sm" variant="outline" disabled={applicationsPage >= applicationsTotalPages - 1} onClick={() => setApplicationsPage((p) => p + 1)}>Next</Button>
                    </div>
                ) : null}
            </div>

            {/* Email modal */}
            <Dialog open={!!emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Send Email</DialogTitle>
                        <DialogDescription>
                            Use a template, tailor it, and send directly to the provider.
                        </DialogDescription>
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
            <Dialog open={!!selectedApplication} onOpenChange={(open) => !open && setSelectedApplication(null)}>
                <DialogContent className="max-w-2xl max-h-[92vh]">
                    <DialogHeader>
                        <DialogTitle>Provider Application</DialogTitle>
                        <DialogDescription>
                            Review key application details, then update status or open the full edit form.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedApplication ? (
                        <div className="max-h-[80vh] overflow-y-auto space-y-4 pr-1">
                            {/* Contact info */}
                            <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
                                <div>
                                    <p className="text-xs text-muted-foreground">Contact</p>
                                    <p className="text-sm font-medium">{selectedApplication.contact_name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Business</p>
                                    <p className="text-sm">{selectedApplication.business_name || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Trade</p>
                                    <p className="text-sm">{selectedApplication.trade}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <StatusBadge
                                        status={selectedApplication.status}
                                        onChange={(s) => {
                                            void updateStatus(selectedApplication.id, s);
                                            setSelectedApplication((prev) => (prev ? { ...prev, status: s } : prev));
                                        }}
                                    />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Email</p>
                                    <button
                                        type="button"
                                        className="text-sm text-primary underline-offset-2 hover:underline"
                                        onClick={() => void copyToClipboard(selectedApplication.email, 'Email')}
                                    >
                                        {selectedApplication.email}
                                    </button>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Phone</p>
                                    <button
                                        type="button"
                                        className="text-sm text-primary underline-offset-2 hover:underline"
                                        onClick={() => void copyToClipboard(selectedApplication.phone, 'Phone')}
                                    >
                                        {selectedApplication.phone}
                                    </button>
                                </div>
                                <div className="sm:col-span-2">
                                    <p className="text-xs text-muted-foreground">Areas</p>
                                    <p className="text-sm">{selectedApplication.areas || '—'}</p>
                                </div>
                                {selectedApplication.notes ? (
                                    <div className="sm:col-span-2">
                                        <p className="text-xs text-muted-foreground">Notes</p>
                                        <p className="text-sm whitespace-pre-wrap">{selectedApplication.notes}</p>
                                    </div>
                                ) : null}
                            </div>

                            {/* Pipeline panel */}
                            <div className="rounded-md border border-border/60 divide-y divide-border/40">
                                {/* Confirmation email row */}
                                <div className="flex items-center justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground">Confirmation email</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {selectedApplication.confirmation_email_status === 'sent'
                                                ? 'Sent successfully'
                                                : selectedApplication.confirmation_email_status === 'failed'
                                                ? `Failed: ${selectedApplication.confirmation_email_error ?? 'unknown error'}`
                                                : 'Not yet sent'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                            selectedApplication.confirmation_email_status === 'sent'   ? 'bg-green-100 text-green-700' :
                                            selectedApplication.confirmation_email_status === 'failed' ? 'bg-red-100 text-red-600' :
                                            'bg-muted text-muted-foreground'
                                        }`}>
                                            {selectedApplication.confirmation_email_status ?? 'pending'}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs"
                                            disabled={resendingConfirmation === selectedApplication.id}
                                            onClick={() => void resendConfirmation(selectedApplication.id)}
                                        >
                                            {resendingConfirmation === selectedApplication.id ? 'Sending…' : 'Resend'}
                                        </Button>
                                    </div>
                                </div>

                                {/* Enrichment row */}
                                <div className="p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-foreground">Enrichment</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {selectedApplication.enrichment_status === 'complete' && selectedApplication.matched_provider_id
                                                    ? `Matched provider — score ${selectedApplication.match_score?.toFixed(2) ?? '?'}`
                                                    : selectedApplication.enrichment_status === 'no_match'
                                                    ? 'No provider match found — summary still generated'
                                                    : selectedApplication.enrichment_status === 'failed'
                                                    ? `Failed: ${selectedApplication.enrichment_error ?? 'unknown error'}`
                                                    : selectedApplication.enrichment_status === 'running'
                                                    ? 'Processing…'
                                                    : selectedApplication.enrichment_status === 'queued'
                                                    ? 'Queued — next cron run picks this up'
                                                    : 'Pending — cron will queue on next run'}
                                            </p>
                                        </div>
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
                                            selectedApplication.enrichment_status === 'complete' ? 'bg-green-100 text-green-700' :
                                            selectedApplication.enrichment_status === 'no_match' ? 'bg-amber-100 text-amber-700' :
                                            selectedApplication.enrichment_status === 'failed'   ? 'bg-red-100 text-red-600' :
                                            selectedApplication.enrichment_status === 'running'  ? 'bg-blue-100 text-blue-700' :
                                            selectedApplication.enrichment_status === 'queued'   ? 'bg-sky-100 text-sky-700' :
                                            'bg-muted text-muted-foreground'
                                        }`}>
                                            {selectedApplication.enrichment_status ?? 'pending'}
                                        </span>
                                    </div>
                                    {selectedApplication.matched_provider_id ? (
                                        <p className="text-xs text-muted-foreground">
                                            Provider ID:{' '}
                                            <button
                                                type="button"
                                                className="font-sans text-primary underline-offset-2 hover:underline"
                                                onClick={() => void copyToClipboard(selectedApplication.matched_provider_id!, 'Provider ID')}
                                            >
                                                {selectedApplication.matched_provider_id}
                                            </button>
                                        </p>
                                    ) : null}
                                    {(selectedApplication.applicant_summary ?? selectedApplication.gemini_summary) ? (
                                        <div className="rounded border border-border/50 bg-muted/20 p-2">
                                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                                                {selectedApplication.applicant_summary ? 'Applicant-edited summary' : 'Gemini-generated summary'}
                                            </p>
                                            <p className="text-xs text-foreground leading-relaxed line-clamp-5">
                                                {selectedApplication.applicant_summary ?? selectedApplication.gemini_summary}
                                            </p>
                                        </div>
                                    ) : null}
                                </div>

                                {/* Invitation row */}
                                <div className="flex items-start justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground">Invitation email</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {selectedApplication.invitation_email_status === 'sent'
                                                ? 'Sent — applicant has a profile edit link'
                                                : selectedApplication.invitation_email_status === 'failed'
                                                ? `Failed: ${selectedApplication.invitation_email_error ?? 'unknown error'}`
                                                : !(selectedApplication.applicant_summary ?? selectedApplication.gemini_summary)
                                                ? 'Waiting for enrichment summary before sending'
                                                : 'Ready to send'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                            selectedApplication.invitation_email_status === 'sent'   ? 'bg-green-100 text-green-700' :
                                            selectedApplication.invitation_email_status === 'failed' ? 'bg-red-100 text-red-600' :
                                            (selectedApplication.applicant_summary ?? selectedApplication.gemini_summary) ? 'bg-muted/50 text-muted-foreground' :
                                            'bg-muted text-muted-foreground'
                                        }`}>
                                            {selectedApplication.invitation_email_status ?? ((selectedApplication.applicant_summary ?? selectedApplication.gemini_summary) ? 'ready' : 'waiting')}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="h-7 text-xs"
                                            disabled={
                                                sendingInvitation === selectedApplication.id ||
                                                !(selectedApplication.applicant_summary ?? selectedApplication.gemini_summary)
                                            }
                                            onClick={() => void sendInvitation(selectedApplication.id)}
                                        >
                                            {sendingInvitation === selectedApplication.id ? 'Sending…' :
                                             selectedApplication.invitation_email_status === 'sent' ? 'Resend' : 'Send Invitation'}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setEmailTarget(selectedApplication);
                                        setEmailTemplate('waitlist');
                                    }}
                                >
                                    Send Custom Email
                                </Button>
                                <Button variant="secondary" onClick={() => setEditApplication({ ...selectedApplication })}>Edit Details</Button>
                                <Button
                                    variant="outline"
                                    onClick={() => window.open(`mailto:${selectedApplication.email}`, '_blank')}
                                >
                                    Open In Mail
                                </Button>
                                <Button variant="outline" onClick={() => setSelectedApplication(null)}>Close</Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
            <Dialog open={!!editApplication} onOpenChange={(open) => !open && setEditApplication(null)}>
                <DialogContent className="max-w-2xl max-h-[92vh]">
                    <DialogHeader>
                        <DialogTitle>Edit Provider Application</DialogTitle>
                        <DialogDescription>
                            Full application details — contact info, trade, service area, and notes.
                        </DialogDescription>
                    </DialogHeader>
                    {editApplication ? (
                        <div className="max-h-[72vh] overflow-y-auto space-y-4 pr-1">

                            {/* Contact */}
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <Label className="text-xs">Contact name</Label>
                                        <Input className="mt-1" value={editApplication.contact_name} onChange={(e) => setEditApplication({ ...editApplication, contact_name: e.target.value })} placeholder="Contact name" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Business name</Label>
                                        <Input className="mt-1" value={editApplication.business_name ?? ''} onChange={(e) => setEditApplication({ ...editApplication, business_name: e.target.value })} placeholder="Business name" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Phone</Label>
                                        <Input className="mt-1" value={editApplication.phone} onChange={(e) => setEditApplication({ ...editApplication, phone: e.target.value })} placeholder="Phone" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Email</Label>
                                        <Input className="mt-1" value={editApplication.email} onChange={(e) => setEditApplication({ ...editApplication, email: e.target.value })} placeholder="Email" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Website</Label>
                                        <Input className="mt-1" value={editApplication.website ?? ''} onChange={(e) => setEditApplication({ ...editApplication, website: e.target.value || null })} placeholder="https://" />
                                    </div>
                                    <div className="flex items-center gap-2 pt-5">
                                        <input
                                            type="checkbox"
                                            id="edit-whatsapp"
                                            checked={editApplication.whatsapp_available ?? false}
                                            onChange={(e) => setEditApplication({ ...editApplication, whatsapp_available: e.target.checked })}
                                            className="h-4 w-4 rounded border-border"
                                        />
                                        <Label htmlFor="edit-whatsapp" className="text-xs cursor-pointer">WhatsApp available</Label>
                                    </div>
                                </div>
                            </div>

                            {/* Trade */}
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trade</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <Label className="text-xs">Trade</Label>
                                        <Input className="mt-1" value={editApplication.trade} onChange={(e) => setEditApplication({ ...editApplication, trade: e.target.value })} placeholder="e.g. Plumbing" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Founded year</Label>
                                        <Input className="mt-1" type="number" value={editApplication.founded_year ?? ''} onChange={(e) => setEditApplication({ ...editApplication, founded_year: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 2015" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Team size</Label>
                                        <Input className="mt-1" type="number" value={editApplication.team_size ?? ''} onChange={(e) => setEditApplication({ ...editApplication, team_size: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 5" />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Registration number</Label>
                                        <Input className="mt-1" value={editApplication.registration_number ?? ''} onChange={(e) => setEditApplication({ ...editApplication, registration_number: e.target.value || null })} placeholder="Reg / CIPC number" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <Label className="text-xs">Specialisations / trade description</Label>
                                    <Textarea className="mt-1" rows={3} value={editApplication.trade_description ?? ''} onChange={(e) => setEditApplication({ ...editApplication, trade_description: e.target.value || null })} placeholder="What they specialise in..." />
                                </div>
                                <div className="mt-3">
                                    <Label className="text-xs">Certifications</Label>
                                    <Textarea className="mt-1" rows={2} value={editApplication.certifications ?? ''} onChange={(e) => setEditApplication({ ...editApplication, certifications: e.target.value || null })} placeholder="Any relevant certifications..." />
                                </div>
                                <div className="mt-3">
                                    <Label className="text-xs">Highlights</Label>
                                    <Textarea className="mt-1" rows={2} value={editApplication.highlights ?? ''} onChange={(e) => setEditApplication({ ...editApplication, highlights: e.target.value || null })} placeholder="Key highlights..." />
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</p>
                                <div>
                                    <Label className="text-xs">Business address</Label>
                                    <Input className="mt-1" value={editApplication.address ?? ''} onChange={(e) => setEditApplication({ ...editApplication, address: e.target.value || null })} placeholder="Street address" />
                                </div>
                                <div className="mt-3">
                                    <Label className="text-xs">Service areas</Label>
                                    <Textarea className="mt-1" rows={2} value={editApplication.areas} onChange={(e) => setEditApplication({ ...editApplication, areas: e.target.value })} />
                                </div>
                            </div>

                            {/* Admin */}
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <Label className="text-xs">Status</Label>
                                        <div className="mt-1">
                                            <StatusBadge status={editApplication.status} onChange={(s) => setEditApplication({ ...editApplication, status: s })} />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs">Referral source</Label>
                                        <Input className="mt-1" value={editApplication.referral ?? ''} onChange={(e) => setEditApplication({ ...editApplication, referral: e.target.value || null })} placeholder="How they heard about us" />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <Label className="text-xs">Internal notes</Label>
                                    <Textarea className="mt-1" rows={3} value={editApplication.notes ?? ''} onChange={(e) => setEditApplication({ ...editApplication, notes: e.target.value || null })} />
                                </div>
                            </div>

                            <div className="flex gap-2 pt-1 sticky bottom-0 bg-background pb-1">
                                <Button onClick={() => void saveApplicationEdit()}>Save changes</Button>
                                <Button variant="outline" onClick={() => setEditApplication(null)}>Cancel</Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
            <Dialog open={!!selectedLiveProvider} onOpenChange={(open) => !open && setSelectedLiveProvider(null)}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Live Provider</DialogTitle>
                        <DialogDescription>
                            Inspect quality signals and trigger quick maintenance actions.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedLiveProvider ? (
                        <div className="space-y-4">
                            <div className="rounded-md border bg-muted/20 p-3">
                                <p className="text-sm font-medium">{selectedLiveProvider.name}</p>
                                <p className="text-sm text-muted-foreground">{selectedLiveProvider.address ?? '—'}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Google rating:{' '}
                                    {selectedLiveProvider.rating != null
                                        ? `${selectedLiveProvider.rating.toFixed(1)} (${selectedLiveProvider.rating_count} reviews)`
                                        : '—'}
                                </p>
                                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                                    <div className="rounded border bg-background p-2">
                                        <p className="text-muted-foreground">Outputs</p>
                                        <p className="font-medium text-foreground">{selectedLiveProvider.output_count ?? '—'}</p>
                                    </div>
                                    <div className="rounded border bg-background p-2">
                                        <p className="text-muted-foreground">Contacts</p>
                                        <p className="font-medium text-foreground">{selectedLiveProvider.contact_count}</p>
                                    </div>
                                    <div className="rounded border bg-background p-2">
                                        <p className="text-muted-foreground">Profile Views</p>
                                        <p className="font-medium text-foreground">{selectedLiveProvider.profile_view_count}</p>
                                    </div>
                                </div>
                            </div>
                            {selectedLiveProvider.google_place_id ? (
                                <div className="rounded border bg-muted/20 p-2">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Google Place ID</p>
                                    <p className="text-xs break-all font-sans">{selectedLiveProvider.google_place_id}</p>
                                </div>
                            ) : null}
                            {selectedLiveProvider.enrichment_review_required ? (
                                <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                        Enrichment needs review
                                    </p>
                                    <p className="mt-1 text-xs text-amber-900">
                                        The AI enrichment failed the leak gate after retries. Some fields were dropped before being
                                        saved. Re-queue enrichment after improving the source data, or edit the fields manually.
                                    </p>
                                    {selectedLiveProvider.enrichment_last_failure ? (
                                        <p className="mt-2 text-[11px] text-amber-900/80">
                                            <span className="font-sans">Last failure:</span>{' '}
                                            {selectedLiveProvider.enrichment_last_failure}
                                        </p>
                                    ) : null}
                                    {selectedLiveProvider.enrichment_last_failure_at ? (
                                        <p className="text-[11px] text-amber-900/80">
                                            <span className="font-sans">When:</span>{' '}
                                            {new Date(selectedLiveProvider.enrichment_last_failure_at).toLocaleString()}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={refreshingGoogle || !selectedLiveProvider.google_place_id}
                                    onClick={() => void refreshRatingsFromGoogle()}
                                >
                                    {refreshingGoogle ? 'Refreshing…' : 'Refresh rating & reviews from Google'}
                                </Button>
                                {selectedLiveProvider.google_place_id ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => void requeueEnrichment(selectedLiveProvider)}
                                    >
                                        Re-queue enrichment
                                    </Button>
                                ) : null}
                                {selectedLiveProvider.google_place_id ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => void copyToClipboard(selectedLiveProvider.google_place_id!, 'Google place id')}
                                    >
                                        Copy Place ID
                                    </Button>
                                ) : null}
                                <Button variant="secondary" onClick={() => setEditLiveProvider({ ...selectedLiveProvider })}>Edit</Button>
                                <Button variant="outline" onClick={() => setSelectedLiveProvider(null)}>Close</Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
            <Dialog open={!!editLiveProvider} onOpenChange={(open) => !open && setEditLiveProvider(null)}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Live Provider</DialogTitle>
                        <DialogDescription>
                            Keep the customer-facing profile, summary, and ranking details up to date.
                        </DialogDescription>
                    </DialogHeader>
                    {editLiveProvider ? (
                        <div className="space-y-3">
                            <div>
                                <Label className="text-xs">Name</Label>
                                <Input className="mt-1" value={editLiveProvider.name} onChange={(e) => setEditLiveProvider({ ...editLiveProvider, name: e.target.value })} placeholder="Name" />
                            </div>
                            <div>
                                <Label className="text-xs">Address</Label>
                                <Textarea className="mt-1" rows={2} value={editLiveProvider.address ?? ''} onChange={(e) => setEditLiveProvider({ ...editLiveProvider, address: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-xs">Rating (manual)</Label>
                                    <Input
                                        className="mt-1"
                                        type="number"
                                        step="0.1"
                                        value={editLiveProvider.rating ?? ''}
                                        onChange={(e) =>
                                            setEditLiveProvider({
                                                ...editLiveProvider,
                                                rating: e.target.value === '' ? null : Number(e.target.value),
                                            })
                                        }
                                        placeholder="e.g. 4.8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Review count (manual)</Label>
                                    <Input
                                        className="mt-1"
                                        type="number"
                                        value={editLiveProvider.rating_count ?? ''}
                                        onChange={(e) =>
                                            setEditLiveProvider({
                                                ...editLiveProvider,
                                                rating_count: e.target.value === '' ? 0 : Number(e.target.value),
                                            })
                                        }
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Pro page “Summary” blends long summary, about, and past work. Short summary is the customer review blurb.
                            </p>
                            <div>
                                <Label className="text-xs">Customer summary (short, from reviews)</Label>
                                <Textarea
                                    className="mt-1 text-sm"
                                    rows={4}
                                    value={editLiveProvider.summary}
                                    onChange={(e) => setEditLiveProvider({ ...editLiveProvider, summary: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Summary long (primary about text)</Label>
                                <Textarea
                                    className="mt-1 text-sm"
                                    rows={4}
                                    value={editLiveProvider.summary_long}
                                    onChange={(e) => setEditLiveProvider({ ...editLiveProvider, summary_long: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label className="text-xs">About</Label>
                                <Textarea
                                    className="mt-1 text-sm"
                                    rows={3}
                                    value={editLiveProvider.about}
                                    onChange={(e) => setEditLiveProvider({ ...editLiveProvider, about: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Past work</Label>
                                <Textarea
                                    className="mt-1 text-sm"
                                    rows={3}
                                    value={editLiveProvider.past_work}
                                    onChange={(e) => setEditLiveProvider({ ...editLiveProvider, past_work: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Key person</Label>
                                <Input
                                    className="mt-1"
                                    value={editLiveProvider.key_person}
                                    onChange={(e) => setEditLiveProvider({ ...editLiveProvider, key_person: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Highlights (one per line)</Label>
                                <Textarea
                                    className="mt-1 text-sm font-sans"
                                    rows={4}
                                    value={editLiveProvider.highlights.join('\n')}
                                    onChange={(e) =>
                                        setEditLiveProvider({
                                            ...editLiveProvider,
                                            highlights: linesToList(e.target.value),
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Specialisations (one per line)</Label>
                                <Textarea
                                    className="mt-1 text-sm font-sans"
                                    rows={4}
                                    value={editLiveProvider.specialisations.join('\n')}
                                    onChange={(e) =>
                                        setEditLiveProvider({
                                            ...editLiveProvider,
                                            specialisations: linesToList(e.target.value),
                                        })
                                    }
                                />
                            </div>

                            <div>
                                <Label className="text-xs">Certifications (one per line)</Label>
                                <Textarea
                                    className="mt-1 text-sm font-sans"
                                    rows={4}
                                    value={editLiveProvider.certifications.join('\n')}
                                    onChange={(e) =>
                                        setEditLiveProvider({
                                            ...editLiveProvider,
                                            certifications: linesToList(e.target.value),
                                        })
                                    }
                                    placeholder="e.g. PIRB Licensed Plumbers"
                                />
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Free-text labels shown on the customer profile. Stored in providers.certifications.
                                </p>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button onClick={() => void saveLiveProviderEdit()}>Save</Button>
                                <Button variant="outline" onClick={() => setEditLiveProvider(null)}>Cancel</Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
