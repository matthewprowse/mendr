'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type EventType = 'welcome_start' | 'diagnosis_complete' | 'match_view' | 'provider_contact';

type DiagnosisEvent = {
    id: string;
    session_id: string;
    event_type: EventType;
    provider_id: string | null;
    diagnosis_id: string | null;
    created_at: string;
};

const EVENT_STYLES: Record<EventType, string> = {
    welcome_start:       'bg-blue-100 text-blue-700',
    diagnosis_complete:  'bg-purple-100 text-purple-700',
    match_view:          'bg-amber-100 text-amber-700',
    provider_contact:    'bg-green-100 text-green-700',
};

const EVENT_LABELS: Record<EventType, string> = {
    welcome_start:       'Welcome Start',
    diagnosis_complete:  'Diagnosis Complete',
    match_view:          'Match View',
    provider_contact:    'Provider Contact',
};

function pct(num: number, denom: number): string {
    if (!denom) return '0%';
    return `${Math.round((num / denom) * 100)}%`;
}

function conversionColor(num: number, denom: number): string {
    const rate = denom ? (num / denom) * 100 : 0;
    if (rate >= 50) return 'text-green-600';
    if (rate >= 25) return 'text-amber-600';
    return 'text-red-500';
}

function MetricCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background p-5">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {loading ? (
                <Skeleton className="h-9 w-16" />
            ) : (
                <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
            )}
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
    const steps: EventType[] = ['welcome_start', 'diagnosis_complete', 'match_view', 'provider_contact'];
    const reached = new Set(events.map((e) => e.event_type));
    const contactedProvider = events.find((e) => e.event_type === 'provider_contact')?.provider_id;
    const allReached = steps.every((s) => reached.has(s));

    return (
        <div className={`flex items-center gap-1 text-xs ${allReached ? 'opacity-100' : 'opacity-60'}`}>
            {steps.map((step, i) => (
                <span key={step} className="flex items-center gap-1">
                    <span
                        className={`rounded px-1.5 py-0.5 ${
                            reached.has(step)
                                ? allReached
                                    ? 'bg-green-100 text-green-700'
                                    : EVENT_STYLES[step]
                                : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {step === 'provider_contact' && contactedProvider
                            ? `${EVENT_LABELS[step]} (${contactedProvider.slice(0, 6)}…)`
                            : EVENT_LABELS[step]}
                    </span>
                    {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
                </span>
            ))}
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const [events, setEvents] = useState<DiagnosisEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'today' | '7d'>('today');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch(`/api/admin/analytics?period=${period}`);
        if (res.ok) setEvents(await res.json());
        setLoading(false);
        setPage(0);
    }, [period]);

    useEffect(() => { void load(); }, [load]);

    // Metrics
    const starts     = events.filter((e) => e.event_type === 'welcome_start').length;
    const completes  = events.filter((e) => e.event_type === 'diagnosis_complete').length;
    const views      = events.filter((e) => e.event_type === 'match_view').length;
    const contacts   = events.filter((e) => e.event_type === 'provider_contact').length;

    // Session grouping for "All leads today"
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEvents = events.filter(
        (e) => e.event_type === 'welcome_start' && new Date(e.created_at) >= todayStart
    );
    const todaySessions = Array.from(new Set(todayEvents.map((e) => e.session_id)));
    const sessionMap: Record<string, DiagnosisEvent[]> = {};
    for (const e of events) {
        if (!sessionMap[e.session_id]) sessionMap[e.session_id] = [];
        sessionMap[e.session_id].push(e);
    }

    // Paginated events table
    const pageEvents = [...events].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(events.length / PAGE_SIZE);

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
                <p className="mt-1 text-sm text-muted-foreground">Diagnosis funnel performance.</p>
            </div>

            <Tabs value={period} onValueChange={(v) => setPeriod(v as 'today' | '7d')}>
                <TabsList className="mb-6">
                    <TabsTrigger value="today">Today</TabsTrigger>
                    <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
                </TabsList>

                <TabsContent value={period} className="space-y-6">
                    {/* Metric cards */}
                    <div className="grid gap-4 sm:grid-cols-4">
                        <MetricCard label="Welcome Starts" value={starts} loading={loading} />
                        <MetricCard label="Diagnoses Completed" value={completes} loading={loading} />
                        <MetricCard label="Match Views" value={views} loading={loading} />
                        <MetricCard label="Provider Contacts" value={contacts} loading={loading} />
                    </div>

                    {/* Conversion rates */}
                    {!loading && (
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                { label: 'Start → Diagnosis', num: completes, denom: starts },
                                { label: 'Diagnosis → Match', num: views, denom: completes },
                                { label: 'Match → Contact',   num: contacts, denom: views },
                            ].map(({ label, num, denom }) => (
                                <div key={label} className="flex items-center justify-between rounded-lg border border-border/50 bg-background px-4 py-3">
                                    <span className="text-sm text-muted-foreground">{label}</span>
                                    <span className={`text-lg font-bold ${conversionColor(num, denom)}`}>
                                        {pct(num, denom)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Events table */}
                    <div>
                        <h2 className="mb-3 text-sm font-semibold text-foreground">All Events</h2>
                        <div className="overflow-x-auto rounded-xl border border-border/50">
                            <table className="min-w-full divide-y divide-border/50 text-sm">
                                <thead className="bg-muted/30">
                                    <tr>
                                        {['Time', 'Event', 'Session', 'Provider'].map((h) => (
                                            <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50 bg-background">
                                    {loading ? (
                                        <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>
                                    ) : pageEvents.length === 0 ? (
                                        <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No events.</td></tr>
                                    ) : (
                                        pageEvents.map((e) => (
                                            <tr key={e.id} className="hover:bg-muted/20">
                                                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                                                    {new Date(e.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-3 py-2"><EventBadge type={e.event_type} /></td>
                                                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.session_id.slice(0, 8)}</td>
                                                <td className="px-3 py-2 text-xs text-muted-foreground">{e.provider_id?.slice(0, 8) ?? '—'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="mt-3 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    disabled={page === 0}
                                    onClick={() => setPage((p) => p - 1)}
                                    className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                                >
                                    Previous
                                </button>
                                <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
                                <button
                                    type="button"
                                    disabled={page >= totalPages - 1}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Today's session leads */}
                    {period === 'today' && !loading && (
                        <div>
                            <h2 className="mb-3 text-sm font-semibold text-foreground">
                                All Leads Today ({todaySessions.length})
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
                                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
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
        </div>
    );
}
