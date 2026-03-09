import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { analyseReviewsWithGemini, type ReviewInput } from '@/lib/ai-review-metrics';
import { logAiEvent } from '@/lib/ai-logging';

function normalizePlaceId(placeId: string): string {
    return (placeId || '').replace(/^places\//, '').trim();
}

export async function POST(req: NextRequest) {
    try {
        const startedAt = Date.now();
        const body = await req.json().catch(() => ({}));
        const {
            google_place_id: bodyPlaceId,
            place_id: bodyPlaceIdAlt,
            reviews: bodyReviews,
        } = body;

        const googlePlaceId = bodyPlaceId || bodyPlaceIdAlt;
        const placeIdNorm = googlePlaceId ? normalizePlaceId(googlePlaceId) : '';

        if (!placeIdNorm && !Array.isArray(bodyReviews)) {
            return NextResponse.json(
                {
                    error:
                        'Missing google_place_id (or place_id), or provide reviews array to analyse.',
                },
                { status: 400 }
            );
        }

        let reviews: ReviewInput[];

        if (Array.isArray(bodyReviews) && bodyReviews.length > 0) {
            const mapped: (ReviewInput | null)[] = bodyReviews
                .map((r: unknown) => {
                    if (r && typeof r === 'object' && 'text' in r) {
                        const obj = r as { text: unknown; rating?: unknown };
                        const t = obj.text;
                        const rating =
                            typeof obj.rating === 'number' ? obj.rating : undefined;
                        return {
                            text: typeof t === 'string' ? t : String(t ?? ''),
                            rating,
                        };
                    }
                    return null;
                });
            reviews = mapped.filter((r): r is ReviewInput => r != null);
        } else {
            const apiKey = process.env.GOOGLE_PLACES_API_KEY;
            if (!apiKey) {
                return NextResponse.json(
                    { error: 'GOOGLE_PLACES_API_KEY is required to fetch reviews' },
                    { status: 500 }
                );
            }
            const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeIdNorm)}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask':
                        'id,displayName,reviews,rating,userRatingCount',
                },
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error('Places API error:', res.status, errText);
                return NextResponse.json(
                    {
                        error: `Failed to fetch place details: ${res.status}`,
                        details: process.env.NODE_ENV === 'development' ? errText : undefined,
                    },
                    { status: 502 }
                );
            }
            const placeData = await res.json();
            const rawReviews = placeData.reviews || [];
            type PlaceReview = { text?: string | { text?: string }; rating?: number };
            reviews = rawReviews
                .slice(0, 20)
                .map((r: PlaceReview) => ({
                    text:
                        typeof r.text === 'string'
                            ? r.text
                            : (r.text && typeof r.text === 'object' && 'text' in r.text ? r.text.text : '') ?? '',
                    rating: typeof r.rating === 'number' ? r.rating : undefined,
                }))
                .filter((r: ReviewInput) => r.text && r.text.length > 0);
        }

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY is not configured' },
                { status: 500 }
            );
        }

        const analysis = await analyseReviewsWithGemini(reviews, geminiKey);

        const adminSupabase = await createSupabaseAdminClient();

        const updatePayload = {
            ai_review_summary: analysis.summary,
            positives: analysis.positives,
            negatives: analysis.negatives,
            // DB columns still use the original 4-metric schema; we map:
            // - punctuality -> metrics_punctuality
            // - cleanliness -> metrics_tidiness (labelled as cleanliness in UI)
            // - professionalism -> metrics_professionalism
            // - value_for_money -> metrics_cleanup (repurposed as value-for-money)
            metrics_punctuality: analysis.metrics.punctuality,
            metrics_tidiness: analysis.metrics.cleanliness,
            metrics_professionalism: analysis.metrics.professionalism,
            metrics_cleanup: analysis.metrics.value_for_money,
            updated_at: new Date().toISOString(),
        };

        let profileId: string | null = null;

        if (placeIdNorm) {
            const { data: existing } = await adminSupabase
                .from('provider_profiles')
                .select('id')
                .eq('google_place_id', placeIdNorm)
                .maybeSingle();

            if (existing?.id) {
                profileId = existing.id;
                const { error } = await adminSupabase
                    .from('provider_profiles')
                    .update(updatePayload)
                    .eq('id', existing.id);
                if (error) {
                    console.error('provider_profiles update error:', error);
                    return NextResponse.json(
                        { error: 'Failed to update provider profile', details: error.message },
                        { status: 500 }
                    );
                }
            }
        }

        const { error: auditError } = await adminSupabase.from('audit_logs').insert({
            user_id: null,
            event_type: 'SYSTEM',
            action: 'REVIEWS_SYNCED',
            entity_type: 'provider_profiles',
            entity_id: profileId,
            payload: {
                google_place_id: placeIdNorm || googlePlaceId,
                reviews_analysed: reviews.length,
                summary: analysis.summary,
                metrics: analysis.metrics,
            },
            metadata: { source: 'api.reviews-sync' },
        });

        if (auditError) {
            console.warn('audit_log REVIEWS_SYNCED insert failed:', auditError);
        }

        const durationMs = Date.now() - startedAt;
        logAiEvent({
            endpoint: 'reviews-sync',
            status: 'ok',
            durationMs,
            meta: {
                placeId: placeIdNorm || googlePlaceId,
                reviewsAnalysed: reviews.length,
            },
        });

        return NextResponse.json({
            ok: true,
            google_place_id: placeIdNorm || googlePlaceId,
            provider_profile_id: profileId,
            reviews_analysed: reviews.length,
            analysis: {
                summary: analysis.summary,
                positives: analysis.positives,
                negatives: analysis.negatives,
                metrics: analysis.metrics,
            },
        });
    } catch (err: any) {
        const durationMs = Date.now();
        logAiEvent({
            endpoint: 'reviews-sync',
            status: 'error',
            durationMs,
            meta: {
                error: err instanceof Error ? err.message : 'Failed to sync reviews',
            },
        });
        // eslint-disable-next-line no-console
        console.error('reviews-sync error:', err);
        return NextResponse.json(
            {
                error: err instanceof Error ? err.message : 'Failed to sync reviews',
            },
            { status: 500 }
        );
    }
}
