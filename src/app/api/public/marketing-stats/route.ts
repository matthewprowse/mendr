import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET() {
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
