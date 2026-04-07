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

type GalleryRow = {
    id: string;
    created_at: string;
    provider_id: string;
    bucket: string | null;
    path: string | null;
    caption: string | null;
    source: string | null;
    sort_order: number | null;
    status: ModerationStatus;
    providers?: { name?: string | null } | null;
};

export default function AdminGalleryPage() {
    const [rows, setRows] = useState<GalleryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<'all' | ModerationStatus>('pending');
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<GalleryRow | null>(null);
    const [editDraft, setEditDraft] = useState<GalleryRow | null>(null);
    const PAGE_SIZE = 50;

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/gallery');
        if (res.ok) {
            const data = (await res.json()) as GalleryRow[];
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
                (r.caption ?? '').toLowerCase().includes(q) ||
                (r.path ?? '').toLowerCase().includes(q)
            );
        });
    }, [rows, query, filter]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    async function updateStatus(id: string, status: ModerationStatus) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        const res = await fetch('/api/admin/gallery', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        if (!res.ok) {
            toast.error('Failed to update image status');
            void load();
        }
    }
    async function saveEdit() {
        if (!editDraft) return;
        const res = await fetch('/api/admin/gallery', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editDraft.id,
                status: editDraft.status,
                caption: editDraft.caption ?? '',
                source: editDraft.source ?? '',
                sort_order: editDraft.sort_order ?? 0,
            }),
        });
        if (!res.ok) {
            toast.error('Failed to save image');
            return;
        }
        setRows((prev) => prev.map((r) => (r.id === editDraft.id ? { ...r, ...editDraft } : r)));
        setSelected((prev) => (prev?.id === editDraft.id ? { ...prev, ...editDraft } : prev));
        setEditDraft(null);
        toast.success('Image updated');
    }

    function imageUrl(row: GalleryRow): string | null {
        if (!baseUrl || !row.path) return null;
        return `${baseUrl}/storage/v1/object/public/${row.bucket || 'gallery'}/${row.path}`;
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader title="Gallery" />
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
                    placeholder="Search provider, caption, path…"
                    className="h-8 max-w-xs text-sm"
                />
            </div>

            <AdminDataTable
                headers={['Preview', 'Provider', 'Caption', 'Source', 'Status', 'Actions']}
                loading={loading}
                emptyText="No images found."
                colSpan={6}
            >
                {paged.map((row) => {
                    const url = imageUrl(row);
                    return (
                        <TableRow key={row.id} className="align-top cursor-pointer" onClick={() => setSelected(row)}>
                            <TableCell>
                                {url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={url} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
                                ) : (
                                    <div className="h-16 w-16 rounded-md border border-border bg-muted" />
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{row.providers?.name ?? '—'}</TableCell>
                            <TableCell className="max-w-[360px] text-xs text-muted-foreground">
                                {row.caption?.trim() || row.path || '—'}
                            </TableCell>
                            <TableCell className="text-xs capitalize text-muted-foreground">{row.source ?? '—'}</TableCell>
                            <TableCell className="text-xs capitalize text-muted-foreground">{row.status}</TableCell>
                            <TableCell>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void updateStatus(row.id, 'approved'); }}>
                                        Approve
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void updateStatus(row.id, 'rejected'); }}>
                                        Reject
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                })}
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
                    <DialogHeader><DialogTitle>Gallery Image</DialogTitle></DialogHeader>
                    {selected ? (
                        <div className="space-y-3">
                            {imageUrl(selected) ? <img src={imageUrl(selected)!} alt="" className="h-56 w-full rounded-md object-cover" /> : null}
                            <p className="text-sm text-muted-foreground">{selected.providers?.name ?? '—'}</p>
                            <p className="text-sm">{selected.caption || selected.path || '—'}</p>
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
                    <DialogHeader><DialogTitle>Edit Image</DialogTitle></DialogHeader>
                    {editDraft ? (
                        <div className="space-y-3">
                            <div className="space-y-1"><Label>Caption</Label><Textarea rows={4} value={editDraft.caption ?? ''} onChange={(e) => setEditDraft({ ...editDraft, caption: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Source</Label><Input value={editDraft.source ?? ''} onChange={(e) => setEditDraft({ ...editDraft, source: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Sort Order</Label><Input type="number" value={editDraft.sort_order ?? 0} onChange={(e) => setEditDraft({ ...editDraft, sort_order: Number(e.target.value) })} /></div>
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
