'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminPageHeader } from '../components/page-header';
import { AdminDataTable } from '../components/data-table';
import { TableCell, TableRow } from '@/components/ui/table';

// ─── Types ───────────────────────────────────────────────────────────────────

type FunnelStage = {
    key: string;
    label: string;
    count: number;
    conversionFromPrior: number | null;
};

type TradeBreakdownRow = {
    trade: string;
    started: number;
    contacted: number;
    conversion: number | null;
};

type FunnelResponse = {
    from: string;
    to: string;
    requestedFrom: string;
    trackingSince: string | null;
    stages: FunnelStage[];
    totalDiagnoses: number;
    overallConversion: number | null;
    medianMinutesToContact: number | null;
    tradeBreakdown: TradeBreakdownRow[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_COLOURS = ['#6366f1', '#a855f7', '#f59e0b', '#22c55e'];

function isoDateOnly(value: string): string {
    return value.slice(0, 10);
}

function formatDateRange(fromIso: string, toIso: string): string {
    const f = new Date(fromIso);
    const t = new Date(toIso);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${f.toLocaleDateString('en-ZA', opts)} – ${t.toLocaleDateString('en-ZA', opts)}`;
}

function formatPercent(value: number | null): string {
    if (value === null) return '—';
    return `${value.toFixed(1)}%`;
}

function formatMinutes(mins: number | null): string {
    if (mins === null) return '—';
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    if (mins < 60) return `${Math.round(mins)}m`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function defaultRange(): { from: string; to: string } {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
    };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
    label,
    value,
    sub,
    loading,
}: {
    label: string;
    value: string | number;
    sub?: string;
    loading: boolean;
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
                {loading ? (
                    <Skeleton className="h-8 w-20" />
                ) : (
                    <p className="text-3xl font-bold text-foreground">{value}</p>
                )}
                {!loading && sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
            </CardContent>
        </Card>
    );
}

function FunnelBars({ stages }: { stages: FunnelStage[] }) {
    const maxCount = Math.max(1, ...stages.map((s) => s.count));
    return (
        <div className="flex flex-col gap-3">
            {stages.map((stage, i) => {
                const width = stage.count > 0 ? Math.max(8, (stage.count / maxCount) * 100) : 0;
                return (
                    <div key={stage.key} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-medium text-foreground">{stage.label}</span>
                            <span className="flex items-baseline gap-3 text-xs text-muted-foreground">
                                <span className="font-sans text-base text-foreground">
                                    {stage.count.toLocaleString('en-ZA')}
                                </span>
                                <span>
                                    {stage.conversionFromPrior === null
                                        ? 'Entry stage'
                                        : `${formatPercent(stage.conversionFromPrior)} from prior`}
                                </span>
                            </span>
                        </div>
                        <div className="h-7 w-full overflow-hidden rounded-md bg-muted/40">
                            <div
                                className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-medium text-white transition-all"
                                style={{
                                    width: `${width}%`,
                                    backgroundColor: STAGE_COLOURS[i % STAGE_COLOURS.length],
                                }}
                            >
                                {stage.count > 0 ? stage.count.toLocaleString('en-ZA') : ''}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AdminFunnelClient() {
    const initial = useMemo(defaultRange, []);
    const [from, setFrom] = useState(initial.from);
    const [to, setTo] = useState(initial.to);
    const [data, setData] = useState<FunnelResponse | null>(null);
    const [loading, setLoad] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (rangeFrom: string, rangeTo: string) => {
        setLoad(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                from: new Date(rangeFrom).toISOString(),
                to: new Date(`${rangeTo}T23:59:59.999Z`).toISOString(),
            });
            const res = await fetch(`/api/admin/funnel?${params.toString()}`);
            if (!res.ok) {
                setError('Could not load funnel data.');
                setData(null);
                return;
            }
            setData((await res.json()) as FunnelResponse);
        } catch {
            setError('Could not load funnel data.');
            setData(null);
        } finally {
            setLoad(false);
        }
    }, []);

    useEffect(() => {
        void load(initial.from, initial.to);
    }, [initial.from, initial.to, load]);

    const stages = data?.stages ?? [];
    const dateRangeLabel = data ? formatDateRange(data.from, data.to) : '…';
    const trackingNote =
        data?.trackingSince && data.trackingSince > (data.requestedFrom ?? '')
            ? `Funnel tracking started ${new Date(data.trackingSince).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}; earlier diagnoses are excluded.`
            : null;

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader title="Diagnosis Funnel" />
                <p className="mt-1 text-sm text-muted-foreground">Showing data for {dateRangeLabel}</p>
                {trackingNote ? (
                    <p className="mt-1 text-xs text-muted-foreground">{trackingNote}</p>
                ) : null}
            </div>

            {/* ── Date range controls ─────────────────────────────────── */}
            <Card className="mb-6">
                <CardContent className="flex flex-wrap items-end gap-3 pt-6">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="funnel-from" className="text-xs">From</Label>
                        <Input
                            id="funnel-from"
                            type="date"
                            value={from}
                            max={to}
                            onChange={(e) => setFrom(e.target.value)}
                            className="w-44"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="funnel-to" className="text-xs">To</Label>
                        <Input
                            id="funnel-to"
                            type="date"
                            value={to}
                            min={from}
                            max={isoDateOnly(new Date().toISOString())}
                            onChange={(e) => setTo(e.target.value)}
                            className="w-44"
                        />
                    </div>
                    <Button onClick={() => void load(from, to)} disabled={loading || !from || !to}>
                        {loading ? 'Loading…' : 'Apply'}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            const r = defaultRange();
                            setFrom(r.from);
                            setTo(r.to);
                            void load(r.from, r.to);
                        }}
                        disabled={loading}
                    >
                        Last 30 days
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <Card className="mb-6 border-destructive/40 bg-destructive/5">
                    <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            {/* ── Summary stats ─────────────────────────────────────── */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <SummaryCard
                    label="Total diagnoses"
                    value={(data?.totalDiagnoses ?? 0).toLocaleString('en-ZA')}
                    sub="Started in range"
                    loading={loading}
                />
                <SummaryCard
                    label="Overall conversion"
                    value={formatPercent(data?.overallConversion ?? null)}
                    sub="Started → Contacted"
                    loading={loading}
                />
                <SummaryCard
                    label="Median time to contact"
                    value={formatMinutes(data?.medianMinutesToContact ?? null)}
                    sub="Diagnosis start → first contact"
                    loading={loading}
                />
            </div>

            {/* ── Funnel bars ───────────────────────────────────────── */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-base">Stages</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex flex-col gap-3">
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : stages.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No funnel data for this range.</p>
                    ) : (
                        <FunnelBars stages={stages} />
                    )}
                </CardContent>
            </Card>

            {/* ── Trade breakdown ───────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">By trade</CardTitle>
                </CardHeader>
                <CardContent>
                    <AdminDataTable
                        headers={['Trade', 'Started', 'Contacted', 'Conversion']}
                        loading={loading}
                        emptyText="No diagnoses in this range."
                        colSpan={4}
                    >
                        {(data?.tradeBreakdown ?? []).map((row) => (
                            <TableRow key={row.trade}>
                                <TableCell className="font-medium text-foreground">{row.trade}</TableCell>
                                <TableCell className="text-muted-foreground">{row.started}</TableCell>
                                <TableCell className="text-muted-foreground">{row.contacted}</TableCell>
                                <TableCell className="text-muted-foreground">
                                    {formatPercent(row.conversion)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </AdminDataTable>
                </CardContent>
            </Card>
        </div>
    );
}
