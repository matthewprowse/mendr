'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminPageHeader } from '../_components/admin-page-header';
import { AdminDataTable } from '../_components/admin-data-table';
import { TableCell, TableRow } from '@/components/ui/table';

type ModerationStatus = 'pending' | 'approved' | 'rejected';

type ReviewRow = {
    id: string;
    created_at: string;
    provider_id: string;
    reviewer_name: string | null;
    title: string | null;
    body: string | null;
    rating: number | null;
    source: string | null;
    status: ModerationStatus;
    published_at: string | null;
    providers?: { name?: string | null } | null;
};

export default function AdminReviewsPage() {
    const [rows, setRows] = useState<ReviewRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<'all' | ModerationStatus>('pending');
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<ReviewRow | null>(null);
    const [editDraft, setEditDraft] = useState<ReviewRow | null>(null);
    const PAGE_SIZE = 50;

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/reviews');
        if (res.ok) {
            const data = (await res.json()) as ReviewRow[];
            setRows(Array.isArray(data) ? data : []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        window.setTimeout(() => {
            void load();
        }, 0);
    }, [load]);

    const counts = useMemo(
        () => ({
            all: rows.length,
            pending: rows.filter((r) => r.status === 'pending').length,
            approved: rows.filter((r) => r.status === 'approved').length,
            rejected: rows.filter((r) => r.status === 'rejected').length,
        }),
        [rows]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (filter !== 'all' && r.status !== filter) return false;
            if (!q) return true;
            const providerName = r.providers?.name ?? '';
            return (
                providerName.toLowerCase().includes(q) ||
                (r.reviewer_name ?? '').toLowerCase().includes(q) ||
                (r.body ?? '').toLowerCase().includes(q) ||
                (r.title ?? '').toLowerCase().includes(q)
            );
        });
    }, [rows, query, filter]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    async function updateStatus(id: string, status: ModerationStatus) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        const res = await fetch('/api/admin/reviews', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        if (!res.ok) {
            toast.error('Failed to update review status');
            void load();
        }
    }
    async function saveEdit() {
        if (!editDraft) return;
        const res = await fetch('/api/admin/reviews', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editDraft.id,
                status: editDraft.status,
                title: editDraft.title ?? '',
                body: editDraft.body ?? '',
                reviewer_name: editDraft.reviewer_name ?? '',
                rating: editDraft.rating ?? null,
            }),
        });
        if (!res.ok) {
            toast.error('Failed to save review');
            return;
        }
        setRows((prev) => prev.map((r) => (r.id === editDraft.id ? { ...r, ...editDraft } : r)));
        setSelected((prev) => (prev?.id === editDraft.id ? { ...prev, ...editDraft } : prev));
        setEditDraft(null);
        toast.success('Review updated');
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader title="Reviews" />
            </div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap gap-1">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setFilter(status)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                                filter === status
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                        >
                            {status} <span className="opacity-60">({counts[status]})</span>
                        </button>
                    ))}
                </div>
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search provider, reviewer, content…"
                    className="h-8 max-w-xs text-sm"
                />
            </div>

            <AdminDataTable
                headers={['Date', 'Provider', 'Reviewer', 'Rating', 'Source', 'Review', 'Status', 'Actions']}
                loading={loading}
                emptyText="No reviews found."
                colSpan={8}
            >
                {paged.map((r) => (
                    <TableRow key={r.id} className="align-top cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.providers?.name ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{r.reviewer_name ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{r.rating ?? '—'}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{r.source ?? '—'}</TableCell>
                        <TableCell className="max-w-[380px]">
                            <p className="text-xs font-medium text-foreground">{r.title?.trim() || 'Untitled'}</p>
                            <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{r.body?.trim() || '—'}</p>
                        </TableCell>
                        <TableCell className="text-xs capitalize text-muted-foreground">{r.status}</TableCell>
                        <TableCell>
                            <div className="flex gap-2">
                                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void updateStatus(r.id, 'approved'); }}>
                                    Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void updateStatus(r.id, 'rejected'); }}>
                                    Reject
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </AdminDataTable>
            {totalPages > 1 ? (
                <div className="mt-3 flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
            ) : null}
            <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Review</DialogTitle></DialogHeader>
                    {selected ? (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">{selected.providers?.name ?? '—'}</p>
                            <p className="text-sm">{selected.body || '—'}</p>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setEditDraft({ ...selected })}>Edit</Button>
                                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
            <Dialog open={!!editDraft} onOpenChange={(open) => !open && setEditDraft(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Edit Review</DialogTitle></DialogHeader>
                    {editDraft ? (
                        <div className="space-y-3">
                            <div className="space-y-1"><Label>Reviewer</Label><Input value={editDraft.reviewer_name ?? ''} onChange={(e) => setEditDraft({ ...editDraft, reviewer_name: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Title</Label><Input value={editDraft.title ?? ''} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Body</Label><Textarea rows={6} value={editDraft.body ?? ''} onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Rating</Label><Input type="number" value={editDraft.rating ?? 0} onChange={(e) => setEditDraft({ ...editDraft, rating: Number(e.target.value) })} /></div>
                            <div className="flex gap-2">
                                <Button onClick={() => void saveEdit()}>Save</Button>
                                <Button variant="outline" onClick={() => setEditDraft(null)}>Cancel</Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
