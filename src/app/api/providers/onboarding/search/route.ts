// Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//
// Onboarding business search. Searches the Mendr `providers` table (our own
// scraped/known businesses) by name so a contractor can find and claim their
// existing listing. Returns self-contained results (address, phone, website,
// coordinates) so selection pre-fills the form with no second request.
//
// Google Places is intentionally NOT used here — it added an external
// dependency that failed (502) when the Places key/billing was unavailable. A
// Google fallback can be layered on later for businesses not yet in our DB.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

type SearchBody = { query?: string };

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'onboardingSearch');
    if (limited) return limited;

    let body: SearchBody;
    try {
        body = (await req.json()) as SearchBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const q = typeof body.query === 'string' ? body.query.trim() : '';
    if (q.length < 2) {
        return NextResponse.json({ error: 'Enter at least 2 characters to search.' }, { status: 400 });
    }
    if (q.length > 200) {
        return NextResponse.json({ error: 'Search query is too long.' }, { status: 400 });
    }

    // Escape ilike wildcards so the user's input matches literally.
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    try {
        const admin = await createSupabaseAdminClient();
        const { data, error } = await admin
            .from('providers')
            .select('id, google_place_id, name, address, phone, website, latitude, longitude, rating, rating_count')
            .ilike('name', pattern)
            .eq('is_active', true)
            .order('rating_count', { ascending: false, nullsFirst: false })
            .limit(15);

        if (error) {
            console.error('[onboarding/search] providers query error:', error.message);
            return NextResponse.json({ error: 'Could not search businesses. Try again in a moment.' }, { status: 500 });
        }

        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const results = rows.map((p) => ({
            placeId: typeof p.google_place_id === 'string' && p.google_place_id ? p.google_place_id : String(p.id),
            name: typeof p.name === 'string' ? p.name : 'Business',
            address: typeof p.address === 'string' ? p.address : '',
            phone: typeof p.phone === 'string' ? p.phone : null,
            website: typeof p.website === 'string' ? p.website : null,
            lat: typeof p.latitude === 'number' ? p.latitude : null,
            lng: typeof p.longitude === 'number' ? p.longitude : null,
            rating: typeof p.rating === 'number' ? p.rating : null,
            userRatingCount: typeof p.rating_count === 'number' ? p.rating_count : null,
        }));

        return NextResponse.json({ results });
    } catch (err) {
        console.error('[onboarding/search] error:', err instanceof Error ? err.message : String(err));
        return NextResponse.json({ error: 'Could not search businesses. Try again in a moment.' }, { status: 500 });
    }
}
