// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function GET(req: NextRequest) {
    const limited = await checkRateLimit(req, 'marketingStats');
    if (limited) return limited;

    const admin = await createSupabaseAdminClient();
    const [diagnosesCountRes, matchViewCountRes, homeownerSessionsRes, providerCountRes, servicesRes] = await Promise.all([
        admin
            .from('diagnosis_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'diagnosis_complete'),
        admin
            .from('diagnosis_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'match_view'),
        admin
            .from('diagnosis_events')
            .select('session_id')
            .eq('event_type', 'welcome_start')
            .order('created_at', { ascending: false })
            .limit(20000),
        admin
            .from('providers')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true),
        admin
            .from('services')
            .select('label')
            .eq('active', true)
            .order('sort_order', { ascending: true }),
    ]);

    const diagnosesCompleted = diagnosesCountRes.count ?? 0;
    const matchViews = matchViewCountRes.count ?? 0;
    const uniqueHomeowners = new Set((homeownerSessionsRes.data ?? []).map((r: any) => r.session_id).filter(Boolean)).size;
    const providerCount = providerCountRes.count ?? 0;
    const serviceLabels = (servicesRes.data ?? [])
        .map((s: any) => String(s.label || '').trim())
        .filter(Boolean);

    return NextResponse.json(
        {
            totals: {
                diagnoses_completed: diagnosesCompleted,
                unique_homeowners: uniqueHomeowners,
                match_views: matchViews,
                providers: providerCount,
            },
            services: serviceLabels,
        },
        {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            },
        }
    );
}
