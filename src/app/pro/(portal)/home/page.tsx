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
import { formatRelativeDate } from '@/lib/format-date';
import { computeMonthRange } from '@/app/contractors/(portal)/account/dashboard-stats';

export const metadata = {
    title: { absolute: 'Mendr Pro: Home' },
    robots: { index: false, follow: false },
};

const RATING_MIN = 3;
const WIN_RATE_MIN = 5;

function extractSuburb(address: string | null): string {
    if (!address) return '';
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return parts[1] ?? parts[0] ?? '';
}

function titleCase(s: string | null): string {
    if (!s) return '';
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Presentational helpers mirroring the customer home / Settings list rhythm.
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
    );
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

function StatRow({ label, value, description }: { label: string; value: string; description?: string }) {
    return (
        <div className="flex items-start gap-3 py-3">
            <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-12 shrink-0"
                tabIndex={-1}
                aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex h-12 flex-col justify-center gap-1">
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold text-foreground">{value}</p>
                </div>
                {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
            </div>
        </div>
    );
}

type DiagRef = { title: string | null; primary_trade: string | null; customer_address: string | null };
type EventRow = {
    id: string;
    created_at: string;
    diagnosis_trade: string | null;
    diagnoses: DiagRef | DiagRef[] | null;
};

export default async function ProHomePage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/pro/auth/login?next=/pro/home');

    const { providerId, pending } = await getProviderState(user.id);

    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Welcome to Mendr Pro</h1>
                    <p className="text-sm text-muted-foreground">
                        {pending
                            ? 'Your claim is under review. We will let you know once your business is verified, and your leads will appear here.'
                            : 'Your business is not linked to a profile yet. Claim it to see the leads waiting for you and start receiving new ones.'}
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
    const { startIso, endIso } = computeMonthRange(new Date());

    const [leadsAll, leadsMonth, views, providerRes, outcomesRes, recentRes] = await Promise.all([
        admin
            .from('provider_contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId),
        admin
            .from('provider_contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .gte('created_at', startIso)
            .lt('created_at', endIso),
        admin
            .from('provider_profile_views')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId),
        admin
            .from('providers')
            .select('name, rating, rating_count, mendr_rating, mendr_rating_count')
            .eq('id', providerId)
            .maybeSingle(),
        admin.from('job_outcomes').select('outcome').eq('provider_id', providerId),
        admin
            .from('provider_contact_events')
            .select('id, created_at, diagnosis_trade, diagnoses(title, primary_trade, customer_address)')
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false })
            .limit(5),
    ]);

    const totalLeads = leadsAll.count ?? 0;
    const enquiriesThisMonth = leadsMonth.count ?? 0;
    const profileViews = views.count ?? 0;

    const provider = providerRes.data as {
        name: string | null;
        rating: number | null;
        rating_count: number | null;
        mendr_rating: number | null;
        mendr_rating_count: number | null;
    } | null;

    let ratingValue = '—';
    let ratingDesc = 'Not enough data yet';
    if (provider?.mendr_rating != null && (provider.mendr_rating_count ?? 0) >= RATING_MIN) {
        ratingValue = provider.mendr_rating.toFixed(1);
        ratingDesc = `${provider.mendr_rating_count} Mendr reviews`;
    } else if (provider?.rating != null && (provider.rating_count ?? 0) > 0) {
        ratingValue = provider.rating.toFixed(1);
        ratingDesc = `${provider.rating_count} Google reviews`;
    }

    const outcomes = (outcomesRes.data ?? []) as { outcome: string | null }[];
    const closed = outcomes.length;
    const won = outcomes.filter((o) => (o.outcome ?? '').toLowerCase() === 'won').length;
    const hasWinData = closed >= WIN_RATE_MIN;
    const winValue = hasWinData ? `${Math.round((won / closed) * 100)}%` : '—';
    const winDesc = hasWinData ? `${won} of ${closed} jobs won` : 'Not enough data yet';

    const recent = ((recentRes.data ?? []) as EventRow[]).map((e) => {
        const diag = Array.isArray(e.diagnoses) ? e.diagnoses[0] : e.diagnoses;
        const title = diag?.title || e.diagnosis_trade || diag?.primary_trade || 'New Enquiry';
        const meta = [titleCase(e.diagnosis_trade ?? diag?.primary_trade ?? null), extractSuburb(diag?.customer_address ?? null)]
            .filter(Boolean)
            .join(' · ');
        return { id: e.id, createdAt: e.created_at, title, meta };
    });

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">
                    {provider?.name ?? 'Your Dashboard'}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Your leads and performance at a glance.
                </p>
            </div>

            <div className="flex flex-col gap-4">
                <SectionHeader title="Performance" subtitle="How your profile is doing on Mendr." />
                <RowList>
                    <StatRow
                        label="New Enquiries This Month"
                        value={String(enquiriesThisMonth)}
                        description={`${totalLeads} all time`}
                    />
                    <StatRow
                        label="Profile Views"
                        value={String(profileViews)}
                        description="Times homeowners opened your profile."
                    />
                    <StatRow label="Rating" value={ratingValue} description={ratingDesc} />
                    <StatRow label="Win Rate" value={winValue} description={winDesc} />
                </RowList>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <SectionHeader
                        title="Recent Enquiries"
                        subtitle="The latest homeowners to contact you."
                    />
                    <Link
                        href="/pro/leads"
                        className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                        View All
                    </Link>
                </div>
                {recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No enquiries yet.</p>
                ) : (
                    <RowList>
                        {recent.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 py-3">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="size-12 shrink-0"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {item.title}
                                    </p>
                                    {item.meta ? (
                                        <p className="truncate text-xs text-muted-foreground">
                                            {item.meta}
                                        </p>
                                    ) : null}
                                </div>
                                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                                    {formatRelativeDate(item.createdAt)}
                                </span>
                            </div>
                        ))}
                    </RowList>
                )}
            </div>
        </>
    );
}
