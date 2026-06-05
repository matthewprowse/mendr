'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AdminPageHeader } from '../components/page-header';

type Claim = {
    id: string;
    providerId: string;
    providerName: string;
    providerAddress: string;
    email: string | null;
    leads: number;
    createdAt: string;
};

export default function AdminClaimsClient() {
    const [rows, setRows] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/claims');
            if (res.ok) {
                const data = (await res.json()) as Claim[];
                setRows(Array.isArray(data) ? data : []);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const review = async (id: string, action: 'approve' | 'reject') => {
        if (acting) return;
        setActing(id);
        try {
            const res = await fetch('/api/admin/claims', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            if (!res.ok) throw new Error();
            setRows((r) => r.filter((c) => c.id !== id));
            toast.success(action === 'approve' ? 'Claim approved.' : 'Claim rejected.');
        } catch {
            toast.error('Could not update the claim. Please try again.');
        } finally {
            setActing(null);
        }
    };

    return (
        <div className="mx-auto w-full max-w-xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader
                    title="Claims"
                    description="Pending business claims. Approve only after verifying the person owns the business."
                />
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending claims.</p>
            ) : (
                <div className="flex flex-col">
                    {rows.map((c, i) => (
                        <Fragment key={c.id}>
                            {i > 0 && <Separator />}
                            <div className="flex items-start gap-3 py-3">
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="text-sm font-medium text-foreground">
                                        {c.providerName}
                                    </p>
                                    {c.providerAddress ? (
                                        <p className="truncate text-xs text-muted-foreground">
                                            {c.providerAddress}
                                        </p>
                                    ) : null}
                                    <p className="text-xs text-muted-foreground">
                                        {c.email ?? 'unknown'} · {c.leads} lead{c.leads === 1 ? '' : 's'} waiting
                                    </p>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <Button
                                        size="sm"
                                        disabled={acting === c.id}
                                        onClick={() => void review(c.id, 'approve')}
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={acting === c.id}
                                        onClick={() => void review(c.id, 'reject')}
                                    >
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        </Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}
