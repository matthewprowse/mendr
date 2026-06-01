'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminPageHeader } from '../components/page-header';
import { AdminDataTable } from '../components/data-table';
import { TableCell, TableRow } from '@/components/ui/table';

// ─── Types ───────────────────────────────────────────────────────────────────

type Signal = { key: string; label: string; count: number };

type ConfidenceResponse = {
    threshold: number;
    sampleSize: number;
    requestedLimit: number;
    histogram: { below: number; mid: number; high: number };
    topBelowSignals: Signal[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(num: number, denom: number): string {
    if (!denom) return '—';
    return `${Math.round((num / denom) * 100)}%`;
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
    label,
    count,
    total,
    sub,
    loading,
    tone,
}: {
    label: string;
    count: number;
    total: number;
    sub: string;
    loading: boolean;
    tone: 'bad' | 'mid' | 'good';
}) {
    const cls =
        tone === 'bad'
            ? 'border-red-300 bg-red-50 text-red-700'
            : tone === 'mid'
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-green-300 bg-green-50 text-green-700';
    return (
        <div className={`flex flex-col gap-2 rounded-xl border p-5 ${cls}`}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {loading ? (
                <Skeleton className="h-9 w-16" />
            ) : (
                <p className="text-3xl font-bold">
                    {count.toLocaleString('en-ZA')}{' '}
                    <span className="text-base font-medium opacity-70">({pct(count, total)})</span>
                </p>
            )}
            {!loading ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
    );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function AdminQualityClient() {
    const [data, setData] = useState<ConfidenceResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [limit, setLimit] = useState('200');

    const load = useCallback(async (sampleLimit: string) => {
        setLoading(true);
        const res = await fetch(`/api/admin/diagnostic-confidence?limit=${sampleLimit}`);
        if (res.ok) setData(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => {
        // Defer so the synchronous setState in `load` runs outside the effect body
        // (matches the admin convention; avoids cascading-render lint).
        const id = window.setTimeout(() => void load(limit), 0);
        return () => window.clearTimeout(id);
    }, [limit, load]);

    const total = data?.sampleSize ?? 0;
    const histogram = data?.histogram ?? { below: 0, mid: 0, high: 0 };
    const threshold = data?.threshold ?? 70;
    const maxSignal = Math.max(1, ...(data?.topBelowSignals ?? []).map((s) => s.count));

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <AdminPageHeader title="Diagnosis Quality" />
                    <p className="mt-1 text-sm text-muted-foreground">
                        Structural-confidence distribution of recent diagnoses. Providers are surfaced at
                        confidence ≥ {threshold}.
                    </p>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="quality-limit" className="text-xs">Sample size</Label>
                    <Select value={limit} onValueChange={setLimit}>
                        <SelectTrigger id="quality-limit" className="h-9 w-36 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="200">Last 200</SelectItem>
                            <SelectItem value="500">Last 500</SelectItem>
                            <SelectItem value="1000">Last 1000</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
                {loading ? 'Loading…' : `Based on ${total.toLocaleString('en-ZA')} recent diagnoses with a structural score.`}
            </p>

            {/* ── Distribution cards ───────────────────────────────── */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <StatCard
                    label={`Below threshold (< ${threshold})`}
                    count={histogram.below}
                    total={total}
                    sub="No providers surfaced"
                    loading={loading}
                    tone="bad"
                />
                <StatCard
                    label={`Mid (${threshold}–89)`}
                    count={histogram.mid}
                    total={total}
                    sub="Surfaced, lower confidence"
                    loading={loading}
                    tone="mid"
                />
                <StatCard
                    label="High (90–100)"
                    count={histogram.high}
                    total={total}
                    sub="Strong diagnoses"
                    loading={loading}
                    tone="good"
                />
            </div>

            {/* ── Distribution bar ─────────────────────────────────── */}
            {!loading && total > 0 ? (
                <div className="mb-8 flex h-4 w-full overflow-hidden rounded-full">
                    <div className="bg-red-400" style={{ width: `${(histogram.below / total) * 100}%` }} />
                    <div className="bg-amber-400" style={{ width: `${(histogram.mid / total) * 100}%` }} />
                    <div className="bg-green-500" style={{ width: `${(histogram.high / total) * 100}%` }} />
                </div>
            ) : null}

            {/* ── Top score-dragging signals ───────────────────────── */}
            <h2 className="mb-3 text-base font-semibold text-foreground">
                What is dragging below-threshold scores down
            </h2>
            <AdminDataTable
                headers={['Signal', 'Affected diagnoses', '']}
                loading={loading}
                emptyText="No below-threshold diagnoses in this sample."
                colSpan={3}
            >
                {(data?.topBelowSignals ?? []).map((s) => (
                    <TableRow key={s.key}>
                        <TableCell className="font-medium text-foreground">{s.label}</TableCell>
                        <TableCell className="w-24 text-muted-foreground">{s.count}</TableCell>
                        <TableCell>
                            <div className="h-2 w-full rounded-full bg-muted">
                                <div
                                    className="h-2 rounded-full bg-red-400"
                                    style={{ width: `${(s.count / maxSignal) * 100}%` }}
                                />
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </AdminDataTable>
        </div>
    );
}
