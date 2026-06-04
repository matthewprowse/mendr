'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { TableCell, TableRow } from '@/components/ui/table';
import { AdminPageHeader } from '../components/page-header';
import { AdminDataTable } from '../components/data-table';

type BetaCode = {
    id: string;
    code: string;
    label: string | null;
    note: string | null;
    is_active: boolean;
    max_uses: number | null;
    redemption_count: number;
    last_redeemed_at: string | null;
    expires_at: string | null;
    created_at: string;
    distinct_ips: number;
    distinct_sessions: number;
};

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A code is "possibly shared" when it has been redeemed from more than one
 * distinct device (session) — or, as a fallback, more than one distinct IP.
 * Sessions are the stronger signal; IPs alone can shift on mobile networks.
 */
function isPossiblyShared(c: BetaCode): boolean {
    const devices = Math.max(c.distinct_sessions, c.distinct_ips);
    return devices > 1;
}

export default function AdminBetaCodesClient() {
    const [codes, setCodes] = useState<BetaCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [selected, setSelected] = useState<BetaCode | null>(null);

    const load = useCallback(
        () =>
            fetch('/api/admin/beta-codes')
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
                .then((data: BetaCode[]) => setCodes(data))
                .catch(() => toast.error('Could not load access codes.'))
                .finally(() => setLoading(false)),
        [],
    );

    useEffect(() => {
        void load();
    }, [load]);

    async function copyCode(code: string) {
        try {
            await navigator.clipboard.writeText(code);
            toast.success(`Copied ${code}`);
        } catch {
            toast.error('Could not copy to clipboard.');
        }
    }

    async function toggleActive(c: BetaCode) {
        const next = !c.is_active;
        setCodes((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: next } : x)));
        const res = await fetch('/api/admin/beta-codes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: c.id, is_active: next }),
        });
        if (!res.ok) {
            toast.error('Could not update code.');
            void load();
        }
    }

    const activeCount = codes.filter((c) => c.is_active).length;
    const sharedCount = codes.filter(isPossiblyShared).length;

    return (
        <div className="mx-auto w-full max-w-xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <AdminPageHeader
                    title="Access codes"
                    description="Issue an individual early-access code per person, then watch how each one is used. A code redeemed on several devices may be shared."
                />
                <CreateCodeDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    onCreated={(c) => setCodes((prev) => [c, ...prev])}
                />
            </div>

            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>{codes.length} total</span>
                <span>{activeCount} active</span>
                {sharedCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={14} />
                        {sharedCount} possibly shared
                    </span>
                ) : null}
            </div>

            <AdminDataTable
                headers={['Code', 'For', 'Uses', 'Devices', 'Last used', 'Active', '']}
                loading={loading}
                emptyText="No access codes yet. Create one to get started."
                colSpan={7}
            >
                {codes.map((c) => {
                    const shared = isPossiblyShared(c);
                    const devices = Math.max(c.distinct_sessions, c.distinct_ips);
                    return (
                        <TableRow
                            key={c.id}
                            className="cursor-pointer"
                            onClick={() => setSelected(c)}
                        >
                            <TableCell className="font-mono text-sm font-medium text-foreground">
                                {c.code}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{c.label ?? '—'}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                                {c.redemption_count}
                                {c.max_uses != null ? ` / ${c.max_uses}` : ''}
                            </TableCell>
                            <TableCell>
                                <span
                                    className={
                                        shared
                                            ? 'inline-flex items-center gap-1 font-medium text-amber-600'
                                            : 'text-muted-foreground'
                                    }
                                >
                                    {shared ? <AlertTriangle size={13} /> : null}
                                    {devices}
                                </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatDate(c.last_redeemed_at)}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                                <Switch
                                    checked={c.is_active}
                                    onCheckedChange={() => void toggleActive(c)}
                                    aria-label={c.is_active ? 'Disable code' : 'Enable code'}
                                />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label="Copy code"
                                    onClick={() => void copyCode(c.code)}
                                >
                                    <Copy size={15} />
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </AdminDataTable>

            <CodeDetailDialog
                code={selected}
                onClose={() => setSelected(null)}
                onChanged={() => void load()}
            />
        </div>
    );
}

// ── Create dialog ──────────────────────────────────────────────────────────────

function CreateCodeDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onCreated: (c: BetaCode) => void;
}) {
    const [label, setLabel] = useState('');
    const [code, setCode] = useState('');
    const [maxUses, setMaxUses] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    function reset() {
        setLabel('');
        setCode('');
        setMaxUses('');
        setNote('');
    }

    async function handleCreate() {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/beta-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: label.trim() || undefined,
                    code: code.trim() || undefined,
                    note: note.trim() || undefined,
                    maxUses: maxUses.trim() ? Number(maxUses) : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data?.error || 'Could not create code.');
                return;
            }
            onCreated(data as BetaCode);
            toast.success(`Created ${data.code}`);
            reset();
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button type="button" className="shrink-0">
                    New code
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New access code</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="bc-label">For (name or email)</Label>
                        <Input
                            id="bc-label"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g. Sipho Ndlovu"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="bc-code">Code</Label>
                        <Input
                            id="bc-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Leave blank to generate one"
                            className="font-mono"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="bc-max">Max uses</Label>
                        <Input
                            id="bc-max"
                            type="number"
                            min={1}
                            value={maxUses}
                            onChange={(e) => setMaxUses(e.target.value)}
                            placeholder="Leave blank for unlimited"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="bc-note">Note (optional)</Label>
                        <Input
                            id="bc-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Anything worth remembering"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void handleCreate()} disabled={saving}>
                        {saving ? 'Creating…' : 'Create code'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Detail / edit dialog ─────────────────────────────────────────────────────

function CodeDetailDialog({
    code,
    onClose,
    onChanged,
}: {
    code: BetaCode | null;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [label, setLabel] = useState('');
    const [note, setNote] = useState('');
    const [maxUses, setMaxUses] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (code) {
            setLabel(code.label ?? '');
            setNote(code.note ?? '');
            setMaxUses(code.max_uses != null ? String(code.max_uses) : '');
        }
    }, [code]);

    if (!code) return null;

    const shared = isPossiblyShared(code);
    const devices = Math.max(code.distinct_sessions, code.distinct_ips);

    async function handleSave() {
        if (!code) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/beta-codes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: code.id,
                    label,
                    note,
                    max_uses: maxUses.trim() ? Number(maxUses) : null,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                toast.error(d?.error || 'Could not save changes.');
                return;
            }
            toast.success('Saved.');
            onChanged();
            onClose();
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!code) return;
        setDeleting(true);
        try {
            const res = await fetch('/api/admin/beta-codes', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: code.id }),
            });
            if (!res.ok) {
                toast.error('Could not delete code.');
                return;
            }
            toast.success('Code deleted.');
            onChanged();
            onClose();
        } finally {
            setDeleting(false);
        }
    }

    return (
        <Dialog open={!!code} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="font-mono">{code.code}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-6">
                    {shared ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <span>
                                Redeemed on {devices} devices. If this code was meant for one
                                person, it may be shared. Disable it below to cut off access.
                            </span>
                        </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <Stat label="Total uses" value={String(code.redemption_count)} />
                        <Stat
                            label="Limit"
                            value={code.max_uses != null ? String(code.max_uses) : 'Unlimited'}
                        />
                        <Stat label="Distinct devices" value={String(code.distinct_sessions)} />
                        <Stat label="Distinct IPs" value={String(code.distinct_ips)} />
                        <Stat label="Last used" value={formatDate(code.last_redeemed_at)} />
                        <Stat label="Created" value={formatDate(code.created_at)} />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="bc-edit-label">For (name or email)</Label>
                        <Input
                            id="bc-edit-label"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="bc-edit-max">Max uses</Label>
                        <Input
                            id="bc-edit-max"
                            type="number"
                            min={1}
                            value={maxUses}
                            onChange={(e) => setMaxUses(e.target.value)}
                            placeholder="Unlimited"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="bc-edit-note">Note</Label>
                        <Input
                            id="bc-edit-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => void handleDelete()}
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting…' : 'Delete'}
                    </Button>
                    <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-medium text-foreground">{value}</span>
        </div>
    );
}
