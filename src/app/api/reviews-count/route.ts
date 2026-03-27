import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest) {
    const limited = checkRateLimit(req, 'reviewsCount');
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
            return NextResponse.json({ scandioReviewCount: 0, googleReviewCount: 0 });
        }

        const [scandioRes, googleRes] = await Promise.all([
            supabase
                .from('reviews')
                .select('id', { count: 'exact', head: true })
                .eq('provider_id', providerId)
                .eq('source', 'scandio')
                .eq('status', 'approved'),
            supabase
                .from('reviews')
                .select('id', { count: 'exact', head: true })
                .eq('provider_id', providerId)
                .eq('source', 'google')
                .eq('status', 'approved'),
        ]);

        return NextResponse.json({
            scandioReviewCount: scandioRes.count ?? 0,
            googleReviewCount: googleRes.count ?? 0,
        });
    } catch {
        return NextResponse.json({ scandioReviewCount: 0, googleReviewCount: 0 });
    }
}

