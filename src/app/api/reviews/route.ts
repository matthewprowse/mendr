/* eslint-disable no-console */
// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

export type MendrCategoryRatings = {
    punctuality: number;
    cleanliness: number;
    work_quality: number;
    quote_accuracy: number;
};

/** 1–5 in half-star steps (1, 1.5, 2, …, 5). */
function isValidHalfStar(n: unknown): n is number {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 5) return false;
    const doubled = n * 2;
    return Number.isInteger(doubled) && doubled >= 2 && doubled <= 10;
}

/**
 * POST body:
 * {
 *   providerId: string (UUID),
 *   reviewerName: string,
 *   reviewTitle?: string,
 *   reviewBody: string,
 *   categoryRatings: { punctuality, cleanliness, work_quality, quote_accuracy } // 1–5 in half-star steps each
 * }
 *
 * Inserts into `reviews` with source `mendr`, status `pending`.
 * Expects columns: provider_id, source, source_ref, status, reviewer_name, rating, body,
 * category_ratings (jsonb), optional title (text), published_at, updated_at.
 */
export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'reviews');
    if (limited) return limited;

    try {
        const body = await req.json();
        const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : '';
        const reviewerName =
            typeof body?.reviewerName === 'string' ? body.reviewerName.trim() : '';
        const reviewTitle =
            typeof body?.reviewTitle === 'string' ? body.reviewTitle.trim() : '';
        const reviewBody = typeof body?.reviewBody === 'string' ? body.reviewBody.trim() : '';
        const cr = body?.categoryRatings as MendrCategoryRatings | undefined;

        if (!providerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId)) {
            return NextResponse.json({ error: 'Invalid provider id' }, { status: 400 });
        }
        if (!reviewerName) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }
        if (reviewerName.length > 100) {
            return NextResponse.json({ error: 'Name must be 100 characters or fewer' }, { status: 400 });
        }
        if (!reviewBody) {
            return NextResponse.json({ error: 'Review body is required' }, { status: 400 });
        }
        if (reviewBody.length > 5000) {
            return NextResponse.json({ error: 'Review must be 5,000 characters or fewer' }, { status: 400 });
        }
        if (reviewTitle && reviewTitle.length > 200) {
            return NextResponse.json({ error: 'Title must be 200 characters or fewer' }, { status: 400 });
        }
        if (
            !cr ||
            !isValidHalfStar(cr.punctuality) ||
            !isValidHalfStar(cr.cleanliness) ||
            !isValidHalfStar(cr.work_quality) ||
            !isValidHalfStar(cr.quote_accuracy)
        ) {
            return NextResponse.json(
                { error: 'Each category must be rated from 1 to 5 (half-star steps allowed)' },
                { status: 400 }
            );
        }

        const sum =
            cr.punctuality + cr.cleanliness + cr.work_quality + cr.quote_accuracy;
        const average = sum / 4;

        const nowIso = new Date().toISOString();
        const sourceRef = `mendr:${providerId}:${randomUUID()}`;

        const adminSupabase = await createSupabaseAdminClient();

        const row: Record<string, unknown> = {
            provider_id: providerId,
            source: 'mendr',
            source_ref: sourceRef.slice(0, 512),
            status: 'pending',
            reviewer_name: reviewerName,
            rating: Number(average.toFixed(2)),
            body: reviewBody,
            category_ratings: {
                punctuality: cr.punctuality,
                cleanliness: cr.cleanliness,
                work_quality: cr.work_quality,
                quote_accuracy: cr.quote_accuracy,
            },
            published_at: nowIso,
            updated_at: nowIso,
        };

        if (reviewTitle) {
            row.title = reviewTitle;
        }

        const { error } = await adminSupabase.from('reviews').insert(row);

        if (error) {
            console.error('reviews insert:', error.message);
            return NextResponse.json(
                { error: error.message || 'Failed to save review' },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
