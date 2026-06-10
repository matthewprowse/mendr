import { Children, type ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getProviderState } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export const metadata = {
    title: { absolute: 'Mendr Pro: Analytics' },
    robots: { index: false, follow: false },
};

const WIN_RATE_MIN = 5;

function titleCase(s: string | null): string {
    if (!s) return '';
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function RowList({ children }: { children: ReactNode }) {
    const rows = Children.toArray(children);
    return (
        <div className="flex flex-col">
            {rows.map((row, i) => (
                <div key={i}>
                    {i > 0 && <Separator />}
                    {row}
                </div>
            ))}
        </div>
    );
}

function StatRow({
    label,
    value,
    description,
}: {
    label: string;
    value: string;
    description?: string;
}) {
    return (
        <div className="flex items-start gap-3 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold text-foreground">{value}</p>
                {description ? (
                    <p className="text-xs text-muted-foreground">{description}</p>
                ) : null}
            </div>
        </div>
    );
}

export default async function ProAnalyticsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/analytics');

    const { providerId, pending } = await getProviderState(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. Your numbers will appear here once your business is verified.'
                            : 'Your business is not linked to a profile yet.'}
                    </p>
                </div>
                {pending ? null : (
                    <Button asChild className="w-fit">
                        <Link href="/pro/claim">Claim Your Business</Link>
                    </Button>
                )}
            </div>
        );
    }

    const admin = await createSupabaseAdminClient();
    // 30-day window (computed at render in this server component).
    const since = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [viewsAll, views30, leadsAll, leads30, leadStatesRes, tradeRes] = await Promise.all([
        admin
            .from('provider_profile_views')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId),
        admin
            .from('provider_profile_views')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .gte('created_at', since),
        admin
            .from('provider_contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId),
        admin
            .from('provider_contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .gte('created_at', since),
        admin
            .from('lead_states')
            .select('status, provider_contact_events!inner(provider_id)')
            .eq('provider_contact_events.provider_id', providerId),
        admin
            .from('provider_contact_events')
            .select('diagnosis_trade')
            .eq('provider_id', providerId)
            .not('diagnosis_trade', 'is', null),
    ]);

    const totalViews = viewsAll.count ?? 0;
    const views30d = views30.count ?? 0;
    const totalLeads = leadsAll.count ?? 0;
    const leads30d = leads30.count ?? 0;

    const conversion = views30d > 0 ? Math.round((leads30d / views30d) * 100) : null;

    const states = (leadStatesRes.data ?? []) as { status: string }[];
    const won = states.filter((s) => s.status === 'won').length;
    const lost = states.filter((s) => s.status === 'lost').length;
    const decided = won + lost;
    const winRate = decided >= WIN_RATE_MIN ? Math.round((won / decided) * 100) : null;

    const tradeCounts = new Map<string, number>();
    for (const r of (tradeRes.data ?? []) as { diagnosis_trade: string | null }[]) {
        const t = r.diagnosis_trade?.trim();
        if (!t) continue;
        tradeCounts.set(t, (tradeCounts.get(t) ?? 0) + 1);
    }
    const topTrades = [...tradeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
                <p className="text-sm text-muted-foreground">
                    How your profile is performing, from real activity.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground">Reach</h2>
                <RowList>
                    <StatRow
                        label="Profile Views"
                        value={String(totalViews)}
                        description={`${views30d} in the last 30 days`}
                    />
                    <StatRow
                        label="Enquiries"
                        value={String(totalLeads)}
                        description={`${leads30d} in the last 30 days`}
                    />
                    <StatRow
                        label="Views to Enquiry"
                        value={conversion === null ? 'Not enough data' : `${conversion}%`}
                        description="How many viewers reached out, last 30 days"
                    />
                </RowList>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground">Outcomes</h2>
                <RowList>
                    <StatRow
                        label="Win Rate"
                        value={winRate === null ? 'Not enough data' : `${winRate}%`}
                        description={
                            winRate === null
                                ? `Shown once you have ${WIN_RATE_MIN} decided leads`
                                : `${won} won of ${decided} decided`
                        }
                    />
                </RowList>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground">Enquiries by Trade</h2>
                {topTrades.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No enquiries yet.</p>
                ) : (
                    <RowList>
                        {topTrades.map(([trade, count]) => (
                            <StatRow
                                key={trade}
                                label={titleCase(trade)}
                                value={String(count)}
                            />
                        ))}
                    </RowList>
                )}
            </div>
        </>
    );
}
