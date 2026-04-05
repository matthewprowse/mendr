'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
                {filtered.map((r) => (
                    <TableRow key={r.id} className="align-top">
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
                                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => void updateStatus(r.id, 'approved')}>
                                    Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void updateStatus(r.id, 'rejected')}>
                                    Reject
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </AdminDataTable>
        </div>
    );
}
