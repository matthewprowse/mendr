import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            place_id,
            provider_profile_slug,
            user_id,
            reviewer_name,
            reviewer_email,
            rating,
            category_ratings,
            title,
            body: reviewBody,
            image_urls,
        } = body;

        if (!reviewer_name?.trim()) {
            return NextResponse.json({ error: 'Reviewer name is required.' }, { status: 400 });
        }
        if (!reviewBody?.trim() || reviewBody.trim().length < 20) {
            return NextResponse.json({ error: 'Review body must be at least 20 characters.' }, { status: 400 });
        }
        if (!rating || rating < 1 || rating > 5) {
            return NextResponse.json({ error: 'Rating must be between 1 and 5.' }, { status: 400 });
        }
        if (!place_id && !provider_profile_slug) {
            return NextResponse.json({ error: 'A provider target is required.' }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();

        // Resolve provider_id from either google_place_id (place_id) or slug/profile
        let providerId: string | null = null;
        if (place_id) {
            const placeIdNorm = place_id.startsWith('places/') ? place_id : `places/${place_id}`;
            const { data: prov } = await supabase
                .from('providers')
                .select('id')
                .eq('google_place_id', placeIdNorm)
                .maybeSingle();
            providerId = (prov as any)?.id ?? null;
        } else if (provider_profile_slug) {
            const { data: prov } = await supabase
                .from('providers')
                .select('id')
                .eq('slug', provider_profile_slug)
                .maybeSingle();
            providerId = (prov as any)?.id ?? null;
        }

        if (!providerId) {
            return NextResponse.json(
                { error: 'Provider not found. Please try again in a moment.' },
                { status: 404 }
            );
        }

        const { error } = await supabase.from('reviews').insert({
            provider_id: providerId,
            source: 'scandio',
            source_ref: null,
            reviewer_user_id: user_id ?? null,
            reviewer_name: reviewer_name.trim(),
            reviewer_email: reviewer_email?.trim() || null,
            rating: Number(rating),
            category_ratings: category_ratings ?? null,
            title: title?.trim() || null,
            body: reviewBody.trim(),
            image_urls: image_urls ?? [],
            status: 'pending',
            relative_publish_time_description: null,
            published_at: new Date().toISOString(),
            raw: null,
            updated_at: new Date().toISOString(),
        });

        if (error) {
            console.error('Review insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Reviews API error:', e);
        return NextResponse.json({ error: 'Failed to submit review.' }, { status: 500 });
    }
}

/** Fetch approved reviews for a given place_id or slug */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const placeId = searchParams.get('place_id');
        const slug = searchParams.get('slug');

        if (!placeId && !slug) {
            return NextResponse.json({ reviews: [] });
        }

        const supabase = await createSupabaseServerClient();

        let providerId: string | null = null;
        if (placeId) {
            const placeIdNorm = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
            const { data: prov } = await supabase
                .from('providers')
                .select('id')
                .eq('google_place_id', placeIdNorm)
                .maybeSingle();
            providerId = (prov as any)?.id ?? null;
        } else if (slug) {
            const { data: prov } = await supabase
                .from('providers')
                .select('id')
                .eq('slug', slug)
                .maybeSingle();
            providerId = (prov as any)?.id ?? null;
        }

        if (!providerId) return NextResponse.json({ reviews: [] });

        let query = supabase
            .from('reviews')
            .select('id, reviewer_name, rating, category_ratings, title, body, image_urls, created_at, published_at')
            .eq('provider_id', providerId)
            .eq('source', 'scandio')
            .eq('status', 'approved')
            .order('published_at', { ascending: false });

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Keep response shape compatible with existing UI (created_at used for display)
        const mapped = (data ?? []).map((r: any) => ({
            id: r.id,
            reviewer_name: r.reviewer_name,
            rating: r.rating,
            category_ratings: r.category_ratings ?? null,
            title: r.title ?? null,
            body: r.body,
            image_urls: r.image_urls ?? [],
            created_at: r.published_at ?? r.created_at,
        }));

        return NextResponse.json({ reviews: mapped });
    } catch (e) {
        console.error('Reviews GET error:', e);
        return NextResponse.json({ error: 'Failed to fetch reviews.' }, { status: 500 });
    }
}
