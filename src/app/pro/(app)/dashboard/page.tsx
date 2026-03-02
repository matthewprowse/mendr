import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getPlanTierInfo, canAddSeat } from '@/lib/plan-tiers';
import { DashboardClient } from './_components/dashboard-client';

export const metadata: Metadata = {
    title: 'Dashboard',
    description: 'Pro dashboard – leads, jobs, and revenue summary.',
};

export default async function ProDashboardPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/dashboard');
    }

    // Resolve provider_profile: id is same as profiles.id for claimed pros
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

    const providerId = profile?.id ?? null;

    // If no provider_profile row exists, redirect to claim flow; fetch plan_tier for Phase 3
    let planTier: string | null = 'solo_starter';
    if (providerId) {
        const { data: providerProfile } = await supabase
            .from('provider_profiles')
            .select('id, plan_tier')
            .eq('id', providerId)
            .single();
        if (!providerProfile) {
            redirect('/pro/claim');
        }
        planTier = (providerProfile as { plan_tier?: string | null }).plan_tier ?? 'solo_starter';
    } else {
        redirect('/pro/claim');
    }

    // Seat count: 1 (owner) + team members
    const { count: teamMemberCount } = await supabase
        .from('provider_team_members')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId);
    const seatCount = 1 + (teamMemberCount ?? 0);
    const tierInfo = getPlanTierInfo(planTier);
    const atSeatLimit = !canAddSeat(planTier, seatCount);

    // Fetch dashboard stats and recent items
    const [leadsRes, jobsRes, revenueRes] = await Promise.all([
        supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .eq('status', 'lead'),
        supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .in('status', ['quoted', 'active']),
        supabase
            .from('jobs')
            .select('current_quote')
            .eq('provider_id', providerId)
            .eq('status', 'completed')
            .gte('updated_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

    const newLeadsCount = leadsRes.count ?? 0;
    const openJobsCount = jobsRes.count ?? 0;
    const revenueThisMonth =
        revenueRes.data?.reduce((sum, j) => sum + (Number((j.current_quote as { total?: number })?.total) || 0), 0) ?? 0;

    // Recent leads and jobs (with client_id for display)
    const { data: recentLeads } = await supabase
        .from('jobs')
        .select('id, status, category, service_address, created_at, client_id')
        .eq('provider_id', providerId)
        .eq('status', 'lead')
        .order('created_at', { ascending: false })
        .limit(5);

    const { data: recentJobs } = await supabase
        .from('jobs')
        .select('id, status, category, service_address, updated_at, client_id')
        .eq('provider_id', providerId)
        .in('status', ['quoted', 'active', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(5);

    const clientIds = [
        ...(recentLeads ?? []).map((j) => j.client_id).filter(Boolean),
        ...(recentJobs ?? []).map((j) => j.client_id).filter(Boolean),
    ] as string[];
    const uniqueClientIds = [...new Set(clientIds)];
    const profilesRes =
        uniqueClientIds.length > 0
            ? await supabase.from('profiles').select('id, first_name, surname').in('id', uniqueClientIds)
            : { data: [] as { id: string; first_name: string | null; surname: string | null }[] };
    const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

    return (
        <DashboardClient
            newLeadsCount={newLeadsCount}
            openJobsCount={openJobsCount}
            revenueThisMonth={revenueThisMonth}
            recentLeads={recentLeads ?? []}
            recentJobs={recentJobs ?? []}
            profilesMap={Object.fromEntries(profilesMap)}
            planLabel={tierInfo.label}
            planFeeFormatted={tierInfo.feeFormatted}
            seatCount={seatCount}
            seatLimit={tierInfo.seatLimit}
            badgeEarned={tierInfo.badgeEarned}
            badgeCopy={tierInfo.badgeCopy}
            atSeatLimit={atSeatLimit}
        />
    );
}
