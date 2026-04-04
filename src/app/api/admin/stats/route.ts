// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function checkAdminCookie(req: NextRequest): boolean {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;
    const session = req.cookies.get('admin_session')?.value;
    return session === Buffer.from(password).toString('base64');
}

export async function GET(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [waitlistNew, contactUnread, todayStarts, pendingReviews, pendingGallery] = await Promise.all([
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
    ]);

    return NextResponse.json({
        newProviders: waitlistNew.count ?? 0,
        unreadMessages: contactUnread.count ?? 0,
        todayStarts: todayStarts.count ?? 0,
        pendingReviews: pendingReviews.count ?? 0,
        pendingGallery: pendingGallery.count ?? 0,
    });
}
