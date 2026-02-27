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

        const { error } = await supabase.from('customer_reviews').insert({
            place_id: place_id ?? null,
            provider_profile_slug: provider_profile_slug ?? null,
            user_id: user_id ?? null,
            reviewer_name: reviewer_name.trim(),
            reviewer_email: reviewer_email?.trim() || null,
            rating: Number(rating),
            category_ratings: category_ratings ?? null,
            title: title?.trim() || null,
            body: reviewBody.trim(),
            image_urls: image_urls ?? [],
            status: 'pending',
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

        let query = supabase
            .from('customer_reviews')
            .select('id, reviewer_name, rating, title, body, image_urls, created_at')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (placeId) {
            query = query.eq('place_id', placeId);
        } else if (slug) {
            query = query.eq('provider_profile_slug', slug);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ reviews: data ?? [] });
    } catch (e) {
        console.error('Reviews GET error:', e);
        return NextResponse.json({ error: 'Failed to fetch reviews.' }, { status: 500 });
    }
}
