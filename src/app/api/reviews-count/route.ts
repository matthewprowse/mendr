// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'reviewsCount');
    if (limited) return limited;

    try {
        const body = await req.json();
        const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : '';
        if (!providerId) {
            return NextResponse.json({ error: 'Missing providerId' }, { status: 400 });
        }

        let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
        try {
            supabase = await createSupabaseServerClient();
        } catch {
            // If Supabase is not configured, keep the UI usable with zeros.
            return NextResponse.json({ mendrReviewCount: 0, googleReviewCount: 0 });
        }

        const [mendrRes, googleRes] = await Promise.all([
            supabase
                .from('reviews')
                .select('id', { count: 'exact', head: true })
                .eq('provider_id', providerId)
                .eq('source', 'mendr')
                .eq('status', 'approved'),
            supabase
                .from('reviews')
                .select('id', { count: 'exact', head: true })
                .eq('provider_id', providerId)
                .eq('source', 'google')
                .eq('status', 'approved'),
        ]);

        return NextResponse.json({
            mendrReviewCount: mendrRes.count ?? 0,
            googleReviewCount: googleRes.count ?? 0,
        });
    } catch {
        return NextResponse.json({ mendrReviewCount: 0, googleReviewCount: 0 });
    }
}

