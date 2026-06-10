// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';


export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const admin = await createSupabaseAdminClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [waitlistNew, contactUnread, todayStarts, pendingReviews, pendingGallery, activeCodes, pendingClaims] = await Promise.all([
        admin
            .from('provider_applications')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'new'),
        admin
            .from('contact_messages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'unread'),
        admin
            .from('diagnosis_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'welcome_start')
            .gte('created_at', todayIso),
        admin
            .from('reviews')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
        admin
            .from('provider_images')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
        admin
            .from('beta_access_codes')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true),
        admin
            .from('provider_claims')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
    ]);

    return NextResponse.json({
        newProviders: waitlistNew.count ?? 0,
        unreadMessages: contactUnread.count ?? 0,
        todayStarts: todayStarts.count ?? 0,
        pendingReviews: pendingReviews.count ?? 0,
        pendingGallery: pendingGallery.count ?? 0,
        activeCodes: activeCodes.count ?? 0,
        pendingClaims: pendingClaims.count ?? 0,
    });
}
