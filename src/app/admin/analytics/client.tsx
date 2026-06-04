'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    Cell,
    Tooltip,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AdminPageHeader } from '../components/page-header';
import { AdminDataTable } from '../components/data-table';
import { TableCell, TableRow } from '@/components/ui/table';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'today' | '7d' | '30d';

type EventType =
    | 'welcome_start'
    | 'diagnosis_complete'
    | 'match_view'
    | 'provider_contact'
    | 'provider_profile_view';

type DiagnosisEvent = {
    id: string;
    session_id: string;
    event_type: EventType;
    provider_id: string | null;
    diagnosis_id: string | null;
    created_at: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_STYLES: Record<EventType, string> = {
    welcome_start:          'bg-blue-100 text-blue-700',
    diagnosis_complete:     'bg-purple-100 text-purple-700',
    match_view:             'bg-amber-100 text-amber-700',
    provider_contact:       'bg-green-100 text-green-700',
    provider_profile_view:  'bg-sky-100 text-sky-700',
};

const EVENT_LABELS: Record<EventType, string> = {
    welcome_start:          'Welcome Start',
    diagnosis_complete:     'Diagnosis Complete',
    match_view:             'Match View',
    provider_contact:       'Provider Contact',
    provider_profile_view:  'Profile View',
};

const FUNNEL_STEPS: EventType[] = [
    'welcome_start',
    'diagnosis_complete',
    'match_view',
    'provider_contact',
];

const FUNNEL_COLORS = ['#6366f1', '#a855f7', '#f59e0b', '#22c55e'];

const CHART_CONFIG = {
    starts:    { label: 'Welcome Starts',       color: '#6366f1' },
    completes: { label: 'Diagnoses Completed',  color: '#a855f7' },
    views:     { label: 'Match Views',          color: '#f59e0b' },
    contacts:  { label: 'Provider Contacts',    color: '#22c55e' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(num: number, denom: number): string {
    if (!denom) return '—';
    return `${Math.round((num / denom) * 100)}%`;
}

function conversionColor(num: number, denom: number): string {
    const rate = denom ? (num / denom) * 100 : 0;
    if (rate >= 50) return 'text-green-600';
    if (rate >= 25) return 'text-amber-600';
    return 'text-red-500';
}

function formatMinutes(mins: number | null): string {
    if (mins === null) return '—';
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    return `${mins.toFixed(1)}m`;
}

function formatEventTime(ts: string, period: Period): string {
    const d = new Date(ts);
    if (period === 'today') {
        return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
    label,
    value,
    sub,
    loading,
    highlight,
}: {
    label: string;
    value: number | string | null;
    sub?: string;
    loading: boolean;
    highlight?: boolean;
}) {
    return (
        <div className={`flex flex-col gap-2 rounded-xl border p-5 ${highlight ? 'border-green-300 bg-green-50' : 'border-border/50 bg-background'}`}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {loading ? (
                <Skeleton className="h-9 w-16" />
            ) : (
                <p className={`text-3xl font-bold ${highlight ? 'text-green-700' : 'text-foreground'}`}>
                    {value == null ? '—' : value}
                </p>
            )}
            {!loading && sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
    );
}

function EventBadge({ type }: { type: EventType }) {
    return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_STYLES[type]}`}>
            {EVENT_LABELS[type]}
        </span>
    );
}

function SessionTimeline({ events }: { events: DiagnosisEvent[] }) {
    const reached = new Set(events.map((e) => e.event_type));
    const allReached = FUNNEL_STEPS.every((s) => reached.has(s));
    const contactedProvider = events.find((e) => e.event_type === 'provider_contact')?.provider_id;

    return (
        <div className={`flex flex-wrap items-center gap-1 text-xs ${allReached ? 'opacity-100' : 'opacity-60'}`}>
            {FUNNEL_STEPS.map((step, i) => (
                <span key={step} className="flex items-center gap-1">
                    <span className={`rounded px-1.5 py-0.5 ${
                        reached.has(step)
                            ? allReached
                                ? 'bg-green-100 text-green-700'
                                : EVENT_STYLES[step]
                            : 'bg-muted text-muted-foreground'
                    }`}>
                        {step === 'provider_contact' && contactedProvider
                            ? `${EVENT_LABELS[step]} (${contactedProvider.slice(0, 6)}…)`
                            : EVENT_LABELS[step]}
                    </span>
                    {i < FUNNEL_STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
                </span>
            ))}
        </div>
    );
}

// ─── Custom funnel tooltip ────────────────────────────────────────────────────

function FunnelTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
            <p className="font-medium text-foreground">{d.label}</p>
            <p className="text-muted-foreground">Sessions: <span className="font-sans text-foreground">{d.sessions}</span></p>
            {d.rate !== null && (
                <p className="text-muted-foreground">From prev: <span className="font-sans text-foreground">{d.rate}</span></p>
            )}
        </div>
    );
}

// ─── Timeline tooltip ─────────────────────────────────────────────────────────

function TimelineTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
            <p className="mb-1 font-medium text-foreground">{label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <span className="inline-block size-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {CHART_CONFIG[p.dataKey as keyof typeof CHART_CONFIG]?.label ?? p.dataKey}
                    </span>
                    <span className="font-sans text-foreground">{p.value}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Main analytics calculations ─────────────────────────────────────────────

function useAnalytics(events: DiagnosisEvent[]) {
    return useMemo(() => {
        // Unique session sets per step
        const sessionsByStep: Record<EventType, Set<string>> = {
            welcome_start:          new Set(),
            diagnosis_complete:     new Set(),
            match_view:             new Set(),
            provider_contact:       new Set(),
            provider_profile_view:  new Set(),
        };
        for (const e of events) {
            sessionsByStep[e.event_type]?.add(e.session_id);
        }

        const startSessions    = sessionsByStep.welcome_start;
        const completeSessions = sessionsByStep.diagnosis_complete;
        const viewSessions     = sessionsByStep.match_view;
        const contactSessions  = sessionsByStep.provider_contact;
        const profileSessions  = sessionsByStep.provider_profile_view;

        // Raw event counts (for reference)
        const rawStarts    = events.filter((e) => e.event_type === 'welcome_start').length;
        const rawCompletes = events.filter((e) => e.event_type === 'diagnosis_complete').length;
        const rawViews     = events.filter((e) => e.event_type === 'match_view').length;
        const rawContacts  = events.filter((e) => e.event_type === 'provider_contact').length;

        // Unique provider contacts
        const uniqueContactedProviders = new Set(
            events
                .filter((e) => e.event_type === 'provider_contact' && e.provider_id)
                .map((e) => e.provider_id as string)
        );
        const uniqueProfiledProviders = new Set(
            events
                .filter((e) => e.event_type === 'provider_profile_view' && e.provider_id)
                .map((e) => e.provider_id as string)
        );

        // Unique diagnoses
        const completionEvents = events.filter(
            (e) => e.event_type === 'diagnosis_complete' && typeof e.diagnosis_id === 'string' && e.diagnosis_id.trim()
        );
        const uniqueDiagnosisIds = new Set(completionEvents.map((e) => String(e.diagnosis_id)));

        // Funnel drop-offs (based on sessions)
        const matchMissingStart    = Array.from(viewSessions).filter((s) => !startSessions.has(s)).length;
        const startMissingComplete = Array.from(startSessions).filter((s) => !completeSessions.has(s)).length;
        const matchMissingComplete = Array.from(viewSessions).filter((s) => !completeSessions.has(s)).length;
        const completeMissingMatch = Array.from(completeSessions).filter((s) => !viewSessions.has(s)).length;

        // Average timing (start → diagnosis, diagnosis → match)
        const sortedEvents = [...events].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const sessionTimes = new Map<string, {
            welcomeAt?: number;
            completeAt?: number;
            matchAt?: number;
        }>();
        for (const e of sortedEvents) {
            const t = new Date(e.created_at).getTime();
            if (!sessionTimes.has(e.session_id)) sessionTimes.set(e.session_id, {});
            const s = sessionTimes.get(e.session_id)!;
            if (e.event_type === 'welcome_start'       && s.welcomeAt  == null) s.welcomeAt  = t;
            if (e.event_type === 'diagnosis_complete'  && s.completeAt == null) s.completeAt = t;
            if (e.event_type === 'match_view' && s.completeAt != null && s.matchAt == null && t >= s.completeAt) {
                s.matchAt = t;
            }
        }
        const startToCompleteDiffs: number[] = [];
        const completeToMatchDiffs: number[] = [];
        for (const s of sessionTimes.values()) {
            if (s.welcomeAt != null && s.completeAt != null)
                startToCompleteDiffs.push(s.completeAt - s.welcomeAt);
            if (s.completeAt != null && s.matchAt != null)
                completeToMatchDiffs.push(s.matchAt - s.completeAt);
        }
        const avg = (arr: number[]) => arr.length > 0
            ? arr.reduce((a, b) => a + b, 0) / arr.length / 60000
            : null;
        // Median helper (more robust for timing)
        const median = (arr: number[]) => {
            if (!arr.length) return null;
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0
                ? sorted[mid] / 60000
                : (sorted[mid - 1] + sorted[mid]) / 2 / 60000;
        };

        return {
            // Session counts (correct basis for conversion)
            startSessions:   startSessions.size,
            completeSessions: completeSessions.size,
            viewSessions:    viewSessions.size,
            contactSessions: contactSessions.size,
            profileSessions: profileSessions.size,
            // Raw event counts
            rawStarts, rawCompletes, rawViews, rawContacts,
            // Unique entities
            uniqueDiagnosisIds: uniqueDiagnosisIds.size,
            uniqueContactedProviders: uniqueContactedProviders.size,
            uniqueProfiledProviders: uniqueProfiledProviders.size,
            // Drop-offs
            matchMissingStart, startMissingComplete, matchMissingComplete, completeMissingMatch,
            // Timing
            avgStartToComplete: avg(startToCompleteDiffs),
            medianStartToComplete: median(startToCompleteDiffs),
            avgCompleteToMatch: avg(completeToMatchDiffs),
            medianCompleteToMatch: median(completeToMatchDiffs),
        };
    }, [events]);
}

// ─── Time-series bucketing ────────────────────────────────────────────────────

function buildTimeSeriesData(events: DiagnosisEvent[], period: Period) {
    const now = new Date();

    if (period === 'today') {
        // Hourly buckets 0–23
        const buckets: Record<number, { starts: number; completes: number; views: number; contacts: number }> = {};
        for (let h = 0; h < 24; h++) buckets[h] = { starts: 0, completes: 0, views: 0, contacts: 0 };
        for (const e of events) {
            const h = new Date(e.created_at).getHours();
            if (e.event_type === 'welcome_start')         buckets[h].starts++;
            if (e.event_type === 'diagnosis_complete')    buckets[h].completes++;
            if (e.event_type === 'match_view')            buckets[h].views++;
            if (e.event_type === 'provider_contact')      buckets[h].contacts++;
        }
        return Array.from({ length: 24 }, (_, h) => ({
            label: `${String(h).padStart(2, '0')}:00`,
            ...buckets[h],
        }));
    }

    // Daily buckets for 7d / 30d
    const days = period === '30d' ? 30 : 7;
    const result: { label: string; starts: number; completes: number; views: number; contacts: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        result.push({
            label: d.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }),
            starts:    events.filter((e) => e.created_at.slice(0, 10) === key && e.event_type === 'welcome_start').length,
            completes: events.filter((e) => e.created_at.slice(0, 10) === key && e.event_type === 'diagnosis_complete').length,
            views:     events.filter((e) => e.created_at.slice(0, 10) === key && e.event_type === 'match_view').length,
            contacts:  events.filter((e) => e.created_at.slice(0, 10) === key && e.event_type === 'provider_contact').length,
        });
    }
    return result;
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AdminAnalyticsPage() {
    const [events, setEvents]               = useState<DiagnosisEvent[]>([]);
    const [loading, setLoading]             = useState(true);
    const [period, setPeriod]               = useState<Period>('today');
    const [page, setPage]                   = useState(0);
    const [selectedEvent, setSelectedEvent] = useState<DiagnosisEvent | null>(null);
    const [editDraft, setEditDraft]         = useState<DiagnosisEvent | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch(`/api/admin/analytics?period=${period}`);
        if (res.ok) setEvents(await res.json());
        setLoading(false);
        setPage(0);
    }, [period]);

    useEffect(() => { void load(); }, [load]);

    const metrics = useAnalytics(events);
    const timeSeriesData = useMemo(() => buildTimeSeriesData(events, period), [events, period]);

    // Funnel chart data — session-based (correct)
    const funnelData = useMemo(() => [
        { label: 'Welcome Start',      key: 'welcome_start',     sessions: metrics.startSessions,    rate: null },
        { label: 'Diagnosis Complete', key: 'diagnosis_complete', sessions: metrics.completeSessions, rate: pct(metrics.completeSessions, metrics.startSessions) },
        { label: 'Match View',         key: 'match_view',        sessions: metrics.viewSessions,     rate: pct(metrics.viewSessions, metrics.completeSessions) },
        { label: 'Provider Contact',   key: 'provider_contact',  sessions: metrics.contactSessions,  rate: pct(metrics.contactSessions, metrics.viewSessions) },
    ], [metrics]);

    // Today's sessions for lead list
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todaySessions = useMemo(() => {
        const startEvents = events.filter(
            (e) => e.event_type === 'welcome_start' && new Date(e.created_at) >= todayStart
        );
        return Array.from(new Set(startEvents.map((e) => e.session_id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events]);

    const sessionMap = useMemo(() => {
        const map: Record<string, DiagnosisEvent[]> = {};
        for (const e of events) {
            if (!map[e.session_id]) map[e.session_id] = [];
            map[e.session_id].push(e);
        }
        return map;
    }, [events]);

    // Paginated events table
    const pageEvents = useMemo(() =>
        [...events]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
        [events, page]
    );
    const totalPages = Math.ceil(events.length / PAGE_SIZE);

    async function saveEdit() {
        if (!editDraft) return;
        const res = await fetch('/api/admin/analytics', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editDraft.id,
                session_id: editDraft.session_id,
                event_type: editDraft.event_type,
                provider_id: editDraft.provider_id,
                diagnosis_id: editDraft.diagnosis_id,
            }),
        });
        if (!res.ok) return;
        setEvents((prev) => prev.map((e) => (e.id === editDraft.id ? { ...e, ...editDraft } : e)));
        setSelectedEvent((prev) => (prev?.id === editDraft.id ? { ...prev, ...editDraft } : prev));
        setEditDraft(null);
    }

    return (
        <div className="mx-auto w-full max-w-xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader title="Analytics" />
            </div>

            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <TabsList className="mb-6">
                    <TabsTrigger value="today">Today</TabsTrigger>
                    <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
                    <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
                </TabsList>

                <TabsContent value={period} className="space-y-8">

                    {/* ── Key metrics ─────────────────────────────────── */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <MetricCard
                            label="Sessions Started"
                            value={metrics.startSessions}
                            sub={`${metrics.rawStarts} total start events`}
                            loading={loading}
                        />
                        <MetricCard
                            label="Diagnoses Completed"
                            value={metrics.completeSessions}
                            sub={`${metrics.uniqueDiagnosisIds} unique diagnoses`}
                            loading={loading}
                        />
                        <MetricCard
                            label="Match Views"
                            value={metrics.viewSessions}
                            sub={`${metrics.rawViews} total events`}
                            loading={loading}
                        />
                        <MetricCard
                            label="Provider Contacts"
                            value={metrics.contactSessions}
                            sub={`${metrics.uniqueContactedProviders} unique providers`}
                            loading={loading}
                            highlight={metrics.contactSessions > 0}
                        />
                        <MetricCard
                            label="Profile Views"
                            value={metrics.profileSessions}
                            sub={`${metrics.uniqueProfiledProviders} unique providers`}
                            loading={loading}
                        />
                    </div>

                    {/* ── Conversion rates (session-based) ─────────────── */}
                    {!loading && (
                        <div>
                            <h2 className="mb-3 text-sm font-semibold text-foreground">Conversion Rates <span className="font-normal text-muted-foreground">(unique sessions)</span></h2>
                            <div className="grid gap-3 sm:grid-cols-3">
                                {([
                                    { label: 'Start → Diagnosis', num: metrics.completeSessions, denom: metrics.startSessions },
                                    { label: 'Diagnosis → Match', num: metrics.viewSessions,     denom: metrics.completeSessions },
                                    { label: 'Match → Contact',   num: metrics.contactSessions,  denom: metrics.viewSessions },
                                ] as const).map(({ label, num, denom }) => (
                                    <div key={label} className="flex items-center justify-between rounded-lg border border-border/50 bg-background px-4 py-3">
                                        <span className="text-sm text-muted-foreground">{label}</span>
                                        <span className={`text-lg font-bold ${conversionColor(num, denom)}`}>
                                            {pct(num, denom)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Charts ──────────────────────────────────────── */}
                    {!loading && (
                        <div className="grid gap-6 lg:grid-cols-2">

                            {/* Funnel chart */}
                            <div className="rounded-xl border border-border/50 bg-background p-5">
                                <h2 className="mb-4 text-sm font-semibold text-foreground">Conversion funnel</h2>
                                <ChartContainer config={CHART_CONFIG} className="min-h-[200px]">
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart
                                            layout="vertical"
                                            data={funnelData}
                                            margin={{ left: 0, right: 40, top: 0, bottom: 0 }}
                                        >
                                            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                                            <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                            <YAxis
                                                type="category"
                                                dataKey="label"
                                                width={135}
                                                tick={{ fontSize: 11 }}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <Tooltip content={<FunnelTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                                            <Bar dataKey="sessions" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: 'var(--muted-foreground)' }}>
                                                {funnelData.map((entry, i) => (
                                                    <Cell key={entry.key} fill={FUNNEL_COLORS[i]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                            </div>

                            {/* Events over time */}
                            <div className="rounded-xl border border-border/50 bg-background p-5">
                                <h2 className="mb-1 text-sm font-semibold text-foreground">
                                    Events over time
                                </h2>
                                <p className="mb-4 text-xs text-muted-foreground">
                                    {period === 'today' ? 'Hourly' : 'Daily'} breakdown
                                </p>
                                <ChartContainer config={CHART_CONFIG} className="min-h-[200px]">
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={timeSeriesData} margin={{ left: -10, right: 0, top: 0, bottom: 0 }}>
                                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                                            <XAxis
                                                dataKey="label"
                                                tick={{ fontSize: 10 }}
                                                tickLine={false}
                                                axisLine={false}
                                                interval={period === 'today' ? 3 : 0}
                                                angle={period === '30d' ? -45 : 0}
                                                textAnchor={period === '30d' ? 'end' : 'middle'}
                                                height={period === '30d' ? 50 : 30}
                                            />
                                            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<TimelineTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                                            <Bar dataKey="starts"    fill={CHART_CONFIG.starts.color}    radius={[2, 2, 0, 0]} name="starts" />
                                            <Bar dataKey="completes" fill={CHART_CONFIG.completes.color} radius={[2, 2, 0, 0]} name="completes" />
                                            <Bar dataKey="views"     fill={CHART_CONFIG.views.color}     radius={[2, 2, 0, 0]} name="views" />
                                            <Bar dataKey="contacts"  fill={CHART_CONFIG.contacts.color}  radius={[2, 2, 0, 0]} name="contacts" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                                {/* Legend */}
                                <div className="mt-3 flex flex-wrap gap-4">
                                    {Object.entries(CHART_CONFIG).map(([key, cfg]) => (
                                        <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: cfg.color }} />
                                            {cfg.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Timing + diagnostics ─────────────────────────── */}
                    {!loading && (
                        <div>
                            <h2 className="mb-3 text-sm font-semibold text-foreground">Timing and diagnostics</h2>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <MetricCard
                                    label="Median: Start → Diagnosis"
                                    value={formatMinutes(metrics.medianStartToComplete)}
                                    sub="Median per session"
                                    loading={loading}
                                />
                                <MetricCard
                                    label="Avg: Start → Diagnosis"
                                    value={formatMinutes(metrics.avgStartToComplete)}
                                    sub="Average per session"
                                    loading={loading}
                                />
                                <MetricCard
                                    label="Median: Diagnosis → Match"
                                    value={formatMinutes(metrics.medianCompleteToMatch)}
                                    sub="Median per session"
                                    loading={loading}
                                />
                                <MetricCard
                                    label="Avg: Diagnosis → Match"
                                    value={formatMinutes(metrics.avgCompleteToMatch)}
                                    sub="Average per session"
                                    loading={loading}
                                />
                                <MetricCard
                                    label="Started Without Completing"
                                    value={metrics.startMissingComplete}
                                    sub="Sessions with start but no diagnosis"
                                    loading={loading}
                                />
                                <MetricCard
                                    label="Completed Without Match View"
                                    value={metrics.completeMissingMatch}
                                    sub="Dropped off before match"
                                    loading={loading}
                                />
                                <MetricCard
                                    label="Match Sessions Missing Start"
                                    value={metrics.matchMissingStart}
                                    sub="Likely direct / bookmarked links"
                                    loading={loading}
                                />
                                <MetricCard
                                    label="Match Sessions Missing Diagnosis"
                                    value={metrics.matchMissingComplete}
                                    sub="Data integrity check"
                                    loading={loading}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Events table ─────────────────────────────────── */}
                    <div>
                        <h2 className="mb-3 text-sm font-semibold text-foreground">
                            All Events ({events.length.toLocaleString()})
                        </h2>
                        <AdminDataTable
                            headers={['Time', 'Event', 'Session', 'Diagnosis', 'Provider']}
                            loading={loading}
                            emptyText="No events."
                            colSpan={5}
                        >
                            {pageEvents.map((e) => (
                                <TableRow key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedEvent(e)}>
                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                        {formatEventTime(e.created_at, period)}
                                    </TableCell>
                                    <TableCell><EventBadge type={e.event_type} /></TableCell>
                                    <TableCell className="font-sans text-xs text-muted-foreground">{e.session_id.slice(0, 8)}</TableCell>
                                    <TableCell className="font-sans text-xs text-muted-foreground">{e.diagnosis_id?.slice(0, 8) ?? '—'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{e.provider_id?.slice(0, 8) ?? '—'}</TableCell>
                                </TableRow>
                            ))}
                        </AdminDataTable>
                        {totalPages > 1 && (
                            <div className="mt-3 flex items-center justify-end gap-2">
                                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                                <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
                                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                            </div>
                        )}
                    </div>

                    {/* ── Today's leads ────────────────────────────────── */}
                    {period === 'today' && !loading && (
                        <div>
                            <h2 className="mb-3 text-sm font-semibold text-foreground">
                                Leads today ({todaySessions.length})
                            </h2>
                            <div className="flex flex-col gap-2">
                                {todaySessions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No sessions today yet.</p>
                                ) : (
                                    todaySessions.map((sid) => {
                                        const sEvents = sessionMap[sid] ?? [];
                                        const hasContact = sEvents.some((e) => e.event_type === 'provider_contact');
                                        return (
                                            <div
                                                key={sid}
                                                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                                                    hasContact
                                                        ? 'border-green-200 bg-green-50'
                                                        : 'border-border/50 bg-background'
                                                }`}
                                            >
                                                <span className="shrink-0 font-sans text-xs text-muted-foreground">
                                                    {sid.slice(0, 8)}
                                                </span>
                                                <SessionTimeline events={sEvents} />
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* ── Event detail dialog ────────────────────────────── */}
            <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
                <DialogContent className="max-w-xl">
                    <DialogHeader><DialogTitle>Event Details</DialogTitle></DialogHeader>
                    {selectedEvent && (
                        <div className="space-y-2 text-sm">
                            <p><span className="text-muted-foreground">Time:</span> {new Date(selectedEvent.created_at).toLocaleString('en-ZA')}</p>
                            <p><span className="text-muted-foreground">Session:</span> <span className="font-sans">{selectedEvent.session_id}</span></p>
                            <p><span className="text-muted-foreground">Event:</span> {selectedEvent.event_type}</p>
                            <p><span className="text-muted-foreground">Diagnosis:</span> <span className="font-sans">{selectedEvent.diagnosis_id ?? '—'}</span></p>
                            <p><span className="text-muted-foreground">Provider:</span> <span className="font-sans">{selectedEvent.provider_id ?? '—'}</span></p>
                            <div className="flex gap-2 pt-1">
                                <Button variant="secondary" onClick={() => setEditDraft({ ...selectedEvent })}>Edit</Button>
                                <Button variant="outline" onClick={() => setSelectedEvent(null)}>Close</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Edit event dialog ──────────────────────────────── */}
            <Dialog open={!!editDraft} onOpenChange={(open) => !open && setEditDraft(null)}>
                <DialogContent className="max-w-xl">
                    <DialogHeader><DialogTitle>Edit Event</DialogTitle></DialogHeader>
                    {editDraft && (
                        <div className="space-y-3">
                            <div className="space-y-1"><Label>Session ID</Label><Input value={editDraft.session_id} onChange={(e) => setEditDraft({ ...editDraft, session_id: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Event Type</Label><Input value={editDraft.event_type} onChange={(e) => setEditDraft({ ...editDraft, event_type: e.target.value as EventType })} /></div>
                            <div className="space-y-1"><Label>Provider ID</Label><Input value={editDraft.provider_id ?? ''} onChange={(e) => setEditDraft({ ...editDraft, provider_id: e.target.value || null })} /></div>
                            <div className="space-y-1"><Label>Diagnosis ID</Label><Input value={editDraft.diagnosis_id ?? ''} onChange={(e) => setEditDraft({ ...editDraft, diagnosis_id: e.target.value || null })} /></div>
                            <div className="flex gap-2">
                                <Button onClick={() => void saveEdit()}>Save</Button>
                                <Button variant="outline" onClick={() => setEditDraft(null)}>Cancel</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
