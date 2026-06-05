import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';
import { Button } from '@/components/ui/button';
import { computeMonthRange } from '@/app/contractors/(portal)/account/dashboard-stats';
import { DashboardStatTile } from '@/app/contractors/(portal)/account/components/dashboard-stat-tile';
import {
    RecentActivityFeed,
    type RecentActivityItem,
} from '@/app/contractors/(portal)/account/components/recent-activity-feed';

export const metadata = {
    title: 'Home | Mendr Pro',
    robots: { index: false, follow: false },
};

const RATING_MIN = 3;
const WIN_RATE_MIN = 5;

function extractSuburb(address: string | null): string {
    if (!address) return '';
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return parts[1] ?? parts[0] ?? '';
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

    const providerId = await getClaimedProviderId(user.id);

    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Welcome to Mendr Pro</h1>
                    <p className="text-sm text-muted-foreground">
                        Your business is not linked to a profile yet. Apply to claim it and start
                        receiving qualified leads from homeowners near you.
                    </p>
                </div>
                <Button asChild className="w-fit">
                    <Link href="/contractors/network">Apply Now</Link>
                </Button>
            </div>
        );
    }

    const admin = await createSupabaseAdminClient();
    const { startIso, endIso } = computeMonthRange(new Date());

    const [enquiriesMonth, leadsAll, views, providerRes, outcomesRes, recentRes] = await Promise.all([
        admin
            .from('provider_contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .gte('created_at', startIso)
            .lt('created_at', endIso),
        admin
            .from('provider_contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId),
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

    const enquiriesThisMonth = enquiriesMonth.count ?? 0;
    const totalLeads = leadsAll.count ?? 0;
    const profileViews = views.count ?? 0;

    const provider = providerRes.data as {
        name: string | null;
        rating: number | null;
        rating_count: number | null;
        mendr_rating: number | null;
        mendr_rating_count: number | null;
    } | null;

    let ratingValue = '—';
    let ratingHint: string | undefined = 'Not enough data yet';
    if (provider?.mendr_rating != null && (provider.mendr_rating_count ?? 0) >= RATING_MIN) {
        ratingValue = provider.mendr_rating.toFixed(1);
        ratingHint = `${provider.mendr_rating_count} Mendr reviews`;
    } else if (provider?.rating != null && (provider.rating_count ?? 0) > 0) {
        ratingValue = provider.rating.toFixed(1);
        ratingHint = `${provider.rating_count} Google reviews`;
    }

    const outcomes = (outcomesRes.data ?? []) as { outcome: string | null }[];
    const closed = outcomes.length;
    const won = outcomes.filter((o) => (o.outcome ?? '').toLowerCase() === 'won').length;
    const hasWinData = closed >= WIN_RATE_MIN;
    const winValue = hasWinData ? `${Math.round((won / closed) * 100)}%` : '—';
    const winHint = hasWinData ? `${won} of ${closed} won` : 'Not enough data yet';

    const recentItems: RecentActivityItem[] = ((recentRes.data ?? []) as EventRow[]).map((e) => {
        const diag = Array.isArray(e.diagnoses) ? e.diagnoses[0] : e.diagnoses;
        const label = diag?.title || e.diagnosis_trade || diag?.primary_trade || 'New enquiry';
        const suburb = extractSuburb(diag?.customer_address ?? null);
        return {
            id: e.id,
            kind: 'lead',
            createdAt: e.created_at,
            label,
            detail: suburb || e.diagnosis_trade || null,
        };
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

            <div className="grid grid-cols-2 gap-3">
                <DashboardStatTile
                    label="New Enquiries"
                    value={enquiriesThisMonth}
                    hint={`${totalLeads} all time`}
                />
                <DashboardStatTile label="Profile Views" value={profileViews} />
                <DashboardStatTile label="Rating" value={ratingValue} hint={ratingHint} />
                <DashboardStatTile label="Win Rate" value={winValue} hint={winHint} />
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Recent Enquiries</h2>
                    <Link
                        href="/pro/leads"
                        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                        View All
                    </Link>
                </div>
                <RecentActivityFeed items={recentItems} />
            </div>
        </>
    );
}
