'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminPageHeader } from '../components/page-header';
import { AdminDataTable } from '../components/data-table';
import { TableCell, TableRow } from '@/components/ui/table';

// ─── Types ───────────────────────────────────────────────────────────────────

type CostTotals = { usd: number; calls: number; tokens: number; cachedTokens: number };

type AiCostSummary = {
    monthToDate: CostTotals;
    lastMonth: CostTotals;
    byModel: Array<{ model: string; usd: number; calls: number }>;
    byEndpoint: Array<{ endpoint: string; usd: number; calls: number }>;
    costPerDiagnosis: number | null;
    callsPerDiagnosis: number | null;
    projection: { elapsedDays: number; daysInMonth: number; runRateUsd: number | null };
};

type DailyRow = { date: string; total_usd: number; total_tokens: number; calls: number };

type PricingRow = {
    id: string;
    model_name: string;
    input_per_1m_usd: number;
    output_per_1m_usd: number;
    cached_input_per_1m_usd: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usd(n: number | null | undefined): string {
    if (n == null) return '—';
    return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function pct(num: number | null, denom: number | null): string {
    if (num == null || !denom) return '—';
    return `${Math.round((num / denom) * 100)}%`;
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function Kpi({
    label,
    value,
    sub,
    loading,
    highlight,
}: {
    label: string;
    value: string;
    sub?: string;
    loading: boolean;
    highlight?: 'good' | 'bad';
}) {
    const tone =
        highlight === 'bad'
            ? 'border-red-300 bg-red-50 text-red-700'
            : highlight === 'good'
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-border/50 bg-background text-foreground';
    return (
        <div className={`flex flex-col gap-2 rounded-xl border p-5 ${tone}`}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {loading ? (
                <Skeleton className="h-8 w-20" />
            ) : (
                <p className="text-2xl font-bold">{value}</p>
            )}
            {!loading && sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
    );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function AiCostsClient() {
    const [summary, setSummary] = useState<AiCostSummary | null>(null);
    const [daily, setDaily] = useState<DailyRow[]>([]);
    const [pricing, setPricing] = useState<PricingRow[]>([]);
    const [budget, setBudget] = useState<number | null>(null);
    const [budgetInput, setBudgetInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingBudget, setSavingBudget] = useState(false);
    const [savingModel, setSavingModel] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const [summaryRes, dailyRes, budgetRes, pricingRes] = await Promise.all([
            fetch('/api/admin/ai-costs/summary'),
            fetch('/api/admin/ai-costs?days=30'),
            fetch('/api/admin/ai-costs/budget'),
            fetch('/api/admin/ai-pricing'),
        ]);
        if (summaryRes.ok) setSummary(await summaryRes.json());
        if (dailyRes.ok) {
            const rows = (await dailyRes.json()) as DailyRow[];
            setDaily(
                Array.isArray(rows)
                    ? [...rows].sort((a, b) => a.date.localeCompare(b.date))
                    : [],
            );
        }
        if (budgetRes.ok) {
            const b = (await budgetRes.json()) as { monthlyBudgetUsd: number | null };
            setBudget(b.monthlyBudgetUsd);
            setBudgetInput(b.monthlyBudgetUsd != null ? String(b.monthlyBudgetUsd) : '');
        }
        if (pricingRes.ok) {
            const p = (await pricingRes.json()) as { rows?: PricingRow[] };
            setPricing(Array.isArray(p.rows) ? p.rows : []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function saveBudget() {
        setSavingBudget(true);
        try {
            const trimmed = budgetInput.trim();
            const amount = trimmed === '' ? null : Number(trimmed);
            if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
                toast.error('Enter a non-negative number, or leave blank to clear.');
                return;
            }
            const res = await fetch('/api/admin/ai-costs/budget', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount }),
            });
            if (!res.ok) {
                toast.error('Failed to save budget');
                return;
            }
            const b = (await res.json()) as { monthlyBudgetUsd: number | null };
            setBudget(b.monthlyBudgetUsd);
            toast.success('Budget saved');
        } finally {
            setSavingBudget(false);
        }
    }

    async function savePricing(row: PricingRow) {
        setSavingModel(row.model_name);
        try {
            const res = await fetch('/api/admin/ai-pricing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_name: row.model_name,
                    input_per_1m_usd: row.input_per_1m_usd,
                    output_per_1m_usd: row.output_per_1m_usd,
                    cached_input_per_1m_usd: row.cached_input_per_1m_usd,
                    source: 'manual',
                }),
            });
            if (!res.ok) {
                toast.error('Failed to save rate');
                return;
            }
            toast.success(`${row.model_name} rate updated`);
        } finally {
            setSavingModel(null);
        }
    }

    const mtd = summary?.monthToDate;
    const projected = summary?.projection.runRateUsd ?? null;
    const projectedOverBudget = budget != null && projected != null && projected > budget;

    return (
        <div className="mx-auto w-full max-w-xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader title="AI Costs" />
                <p className="mt-1 text-sm text-muted-foreground">
                    Gemini spend, month-to-date and projected. Cost history starts May 2026.
                </p>
            </div>

            {/* ── KPI row ──────────────────────────────────────────── */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Kpi
                    label="Spend (this month)"
                    value={usd(mtd?.usd ?? 0)}
                    sub={`${mtd?.calls ?? 0} calls`}
                    loading={loading}
                />
                <Kpi
                    label="Projected month-end"
                    value={usd(projected)}
                    sub="Run-rate"
                    loading={loading}
                    highlight={projectedOverBudget ? 'bad' : undefined}
                />
                <Kpi
                    label="Last month"
                    value={usd(summary?.lastMonth.usd ?? 0)}
                    sub={`${summary?.lastMonth.calls ?? 0} calls`}
                    loading={loading}
                />
                <Kpi
                    label="Cost / diagnosis"
                    value={usd(summary?.costPerDiagnosis ?? null)}
                    sub="This month"
                    loading={loading}
                />
                <Kpi
                    label="Calls / diagnosis"
                    value={
                        summary?.callsPerDiagnosis != null
                            ? summary.callsPerDiagnosis.toFixed(1)
                            : '—'
                    }
                    sub="This month"
                    loading={loading}
                />
                <Kpi
                    label="Tokens (this month)"
                    value={(mtd?.tokens ?? 0).toLocaleString('en-ZA')}
                    sub={`${(mtd?.cachedTokens ?? 0).toLocaleString('en-ZA')} cached`}
                    loading={loading}
                />
            </div>

            {/* ── Budget ───────────────────────────────────────────── */}
            <div className="mb-8 rounded-xl border border-border/50 bg-background p-5">
                <h2 className="mb-3 text-base font-semibold text-foreground">Monthly budget</h2>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="ai-budget" className="text-xs">
                            Budget (USD)
                        </Label>
                        <Input
                            id="ai-budget"
                            type="number"
                            min={0}
                            step="1"
                            value={budgetInput}
                            placeholder="No budget set"
                            onChange={(e) => setBudgetInput(e.target.value)}
                            className="h-9 w-40"
                        />
                    </div>
                    <Button onClick={() => void saveBudget()} disabled={savingBudget}>
                        {savingBudget ? 'Saving…' : 'Save budget'}
                    </Button>
                    {budget != null ? (
                        <div className="flex flex-wrap gap-6 pb-1 text-sm">
                            <span className="text-muted-foreground">
                                Consumed:{' '}
                                <span className="font-medium text-foreground">
                                    {pct(mtd?.usd ?? 0, budget)}
                                </span>
                            </span>
                            <span className="text-muted-foreground">
                                Projected:{' '}
                                <span
                                    className={`font-medium ${projectedOverBudget ? 'text-red-600' : 'text-foreground'}`}
                                >
                                    {pct(projected, budget)} of budget
                                </span>
                            </span>
                        </div>
                    ) : (
                        <p className="pb-2 text-xs text-muted-foreground">
                            Display and alerting only — never throttles AI calls.
                        </p>
                    )}
                </div>
            </div>

            {/* ── Daily spend chart ────────────────────────────────── */}
            <div className="mb-8 rounded-xl border border-border/50 bg-background p-5">
                <h2 className="mb-4 text-base font-semibold text-foreground">
                    Daily spend (last 30 days)
                </h2>
                {loading ? (
                    <Skeleton className="h-56 w-full" />
                ) : daily.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No cost events in the last 30 days.
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                            data={daily}
                            margin={{ left: -10, right: 0, top: 0, bottom: 0 }}
                        >
                            <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 3"
                                stroke="var(--border)"
                            />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(d: string) => d.slice(5)}
                            />
                            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                            <Tooltip
                                formatter={(value: number) => [usd(value), 'Spend']}
                                labelClassName="text-xs"
                                contentStyle={{ fontSize: 12 }}
                            />
                            <Bar dataKey="total_usd" fill="#6366f1" radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* ── Breakdowns ───────────────────────────────────────── */}
            <div className="mb-8 grid gap-6 lg:grid-cols-2">
                <div>
                    <h2 className="mb-3 text-base font-semibold text-foreground">
                        By model (this month)
                    </h2>
                    <AdminDataTable
                        headers={['Model', 'Spend', 'Calls']}
                        loading={loading}
                        emptyText="No spend this month."
                        colSpan={3}
                    >
                        {(summary?.byModel ?? []).map((r) => (
                            <TableRow key={r.model}>
                                <TableCell className="font-medium text-foreground">
                                    {r.model}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {usd(r.usd)}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {r.calls}
                                </TableCell>
                            </TableRow>
                        ))}
                    </AdminDataTable>
                </div>
                <div>
                    <h2 className="mb-3 text-base font-semibold text-foreground">
                        By pipeline stage (this month)
                    </h2>
                    <AdminDataTable
                        headers={['Endpoint', 'Spend', 'Calls']}
                        loading={loading}
                        emptyText="No spend this month."
                        colSpan={3}
                    >
                        {(summary?.byEndpoint ?? []).map((r) => (
                            <TableRow key={r.endpoint}>
                                <TableCell className="font-medium text-foreground">
                                    {r.endpoint}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {usd(r.usd)}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {r.calls}
                                </TableCell>
                            </TableRow>
                        ))}
                    </AdminDataTable>
                </div>
            </div>

            {/* ── Pricing ──────────────────────────────────────────── */}
            <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Model pricing</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                    Per 1,000,000 tokens. Saving a rate creates a new active row and drives all
                    future cost estimates.
                </p>
                <AdminDataTable
                    headers={['Model', 'Input', 'Output', 'Cached input', '']}
                    loading={loading}
                    emptyText="No pricing rows."
                    colSpan={5}
                >
                    {pricing.map((row, idx) => (
                        <TableRow key={row.id || row.model_name}>
                            <TableCell className="font-medium text-foreground">
                                {row.model_name}
                            </TableCell>
                            <TableCell>
                                <Input
                                    type="number"
                                    step="0.001"
                                    value={row.input_per_1m_usd}
                                    onChange={(e) =>
                                        setPricing((prev) =>
                                            prev.map((p, i) =>
                                                i === idx
                                                    ? {
                                                          ...p,
                                                          input_per_1m_usd: Number(
                                                              e.target.value,
                                                          ),
                                                      }
                                                    : p,
                                            ),
                                        )
                                    }
                                    className="h-8 w-24 text-sm"
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    type="number"
                                    step="0.001"
                                    value={row.output_per_1m_usd}
                                    onChange={(e) =>
                                        setPricing((prev) =>
                                            prev.map((p, i) =>
                                                i === idx
                                                    ? {
                                                          ...p,
                                                          output_per_1m_usd: Number(
                                                              e.target.value,
                                                          ),
                                                      }
                                                    : p,
                                            ),
                                        )
                                    }
                                    className="h-8 w-24 text-sm"
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    type="number"
                                    step="0.001"
                                    value={row.cached_input_per_1m_usd ?? ''}
                                    placeholder="—"
                                    onChange={(e) =>
                                        setPricing((prev) =>
                                            prev.map((p, i) =>
                                                i === idx
                                                    ? {
                                                          ...p,
                                                          cached_input_per_1m_usd:
                                                              e.target.value === ''
                                                                  ? null
                                                                  : Number(e.target.value),
                                                      }
                                                    : p,
                                            ),
                                        )
                                    }
                                    className="h-8 w-24 text-sm"
                                />
                            </TableCell>
                            <TableCell>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 text-xs"
                                    disabled={savingModel === row.model_name}
                                    onClick={() => void savePricing(row)}
                                >
                                    {savingModel === row.model_name ? 'Saving…' : 'Save'}
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </AdminDataTable>
            </div>
        </div>
    );
}
