/* eslint-disable no-console */
/**
 * Server-only: fetch a provider from Google Places by place id, upsert into
 * `providers` and `reviews`, then return the provider id.
 * Used when a user clicks "View profile" and the provider is not yet in the DB.
 */
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { normalizeReviewForDisplay } from '@/lib/providers/review-normalization';
import { summarizeReviews, sanitizeCustomerSummary } from '@/lib/providers/review-summary';
import { formatWeekdayDescriptionsTo24h } from '@/lib/providers/format-weekday-descriptions';

const GOOGLE_FIELD_MASK =
    'id,displayName,formattedAddress,rating,userRatingCount,nationalPhoneNumber,websiteUri,location,reviews,regularOpeningHours,currentOpeningHours,photos,generativeSummary,editorialSummary';

const TWENTY_FOUR_MONTHS_MS = 24 * 30 * 24 * 60 * 60 * 1000;

export type RefreshProviderResult =
    | { ok: true; providerId: string; provider: Record<string, unknown> }
    | { ok: false; error: string };

export async function refreshProviderByPlaceId(rawPlaceId: string): Promise<RefreshProviderResult> {
    if (!rawPlaceId || typeof rawPlaceId !== 'string') {
        return { ok: false, error: 'place_id is required' };
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return { ok: false, error: 'Google Places API key is not configured' };
    }

    const placeId = rawPlaceId.startsWith('places/') ? rawPlaceId.replace(/^places\//, '') : rawPlaceId;
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': GOOGLE_FIELD_MASK,
        },
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (process.env.NODE_ENV === 'development') {
             
            console.error('Place Details error:', response.status, errorText);
        }
        return { ok: false, error: 'Failed to fetch provider from Google Places' };
    }

    const place = await response.json();

    let adminSupabase: Awaited<ReturnType<typeof createSupabaseAdminClient>>;
    try {
        adminSupabase = await createSupabaseAdminClient();
    } catch (e) {
        const msg = (e as Error)?.message || 'Supabase admin client failed';
        if (process.env.NODE_ENV === 'development') {
             
            console.error('createSupabaseAdminClient:', msg);
        }
        return { ok: false, error: 'Database not available' };
    }

    const nowIso = new Date().toISOString();
    const now = Date.now();
    const cutoffMs = now - TWENTY_FOUR_MONTHS_MS;

    const normalizedPlaceId =
        typeof place.id === 'string' && place.id.startsWith('places/')
            ? place.id
            : `places/${place.id ?? placeId}`;

    const weekdayDescriptions = (place.regularOpeningHours as any)?.weekdayDescriptions;
    const openingHoursArray = formatWeekdayDescriptionsTo24h(weekdayDescriptions);

    // Extract generative and editorial summaries from Places API (New)
    const generativeSummaryText =
        typeof (place.generativeSummary as { overview?: { text?: string } } | null | undefined)?.overview?.text === 'string'
            ? (place.generativeSummary as { overview: { text: string } }).overview.text.trim() || null
            : typeof (place.generativeSummary as { text?: string } | null | undefined)?.text === 'string'
            ? (place.generativeSummary as { text: string }).text.trim() || null
            : null;

    const editorialSummaryText =
        typeof (place.editorialSummary as { text?: string } | null | undefined)?.text === 'string'
            ? (place.editorialSummary as { text: string }).text.trim() || null
            : null;

    const providerRow = {
        source: 'google' as const,
        google_place_id: normalizedPlaceId,
        name: (place.displayName?.text as string) || 'Unknown Provider',
        address: (place.formattedAddress as string) || null,
        rating: typeof place.rating === 'number' ? place.rating : null,
        rating_count: typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
        phone: (place.nationalPhoneNumber as string) || null,
        website: (place.websiteUri as string) || null,
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
        summary: '',
        last_updated: nowIso,
        updated_at: nowIso,
        weekday_descriptions: openingHoursArray,
        ...(generativeSummaryText ? { google_generative_summary: generativeSummaryText } : {}),
        ...(editorialSummaryText  ? { google_editorial_summary:  editorialSummaryText  } : {}),
    };

    const upsertProviderRes = await adminSupabase
        .from('providers')
        .upsert(providerRow, { onConflict: 'google_place_id' })
        .select('id, google_place_id')
        .single();

    if (upsertProviderRes.error || !upsertProviderRes.data) {
        if (process.env.NODE_ENV === 'development') {
             
            console.error('Provider upsert failed:', upsertProviderRes.error?.message);
        }
        return { ok: false, error: 'Failed to save provider to database' };
    }

    const providerId: string = upsertProviderRes.data.id;

    const reviews = (place.reviews || []) as any[];
    const reviewPayload: any[] = [];

    for (const rev of reviews) {
        const publishTime = rev?.publishTime ? new Date(rev.publishTime).getTime() : null;
        if (publishTime && publishTime < cutoffMs) continue;

        const sourceRef =
            rev?.name ||
            `${normalizedPlaceId}:${rev?.publishTime || rev?.relativePublishTimeDescription || ''}:${
                rev?.authorAttribution?.displayName || rev?.authorAttribution?.name || ''
            }`;

        const rawBody =
            (typeof rev?.originalText?.text === 'string' && rev.originalText.text) ||
            (typeof rev?.text?.text === 'string' && rev.text.text) ||
            (typeof rev?.text === 'string' && rev.text) ||
            '';

        const originalBody = String(rawBody || '').trim();
        if (!originalBody) continue;

        const originalName =
            (rev?.authorAttribution?.displayName as string) ||
            (rev?.authorAttribution?.name as string) ||
            null;

        const normalized = await normalizeReviewForDisplay({
            originalBody,
            originalName,
        });

        reviewPayload.push({
            provider_id: providerId,
            source: 'google',
            source_ref: String(sourceRef || '').slice(0, 512),
            reviewer_name: normalized.reviewerName,
            rating: typeof rev?.rating === 'number' ? rev.rating : null,
            body: normalized.body,
            relative_publish_time_description:
                (rev?.relativePublishTimeDescription as string) || null,
            published_at: rev?.publishTime || null,
            raw: rev ?? null,
            updated_at: nowIso,
        });
    }

    if (reviewPayload.length > 0) {
        const upsertRes = await adminSupabase
            .from('reviews')
            .upsert(reviewPayload, { onConflict: 'provider_id,source,source_ref' });
        if (upsertRes.error && process.env.NODE_ENV === 'development') {
             
            console.error('Reviews upsert failed:', upsertRes.error.message);
        }
    }

    const cutoffIso = new Date(cutoffMs).toISOString();
    await adminSupabase
        .from('reviews')
        .delete()
        .eq('provider_id', providerId)
        .eq('source', 'google')
        .lt('published_at', cutoffIso);

    const { data: recentRows } = await adminSupabase
        .from('reviews')
        .select('id, published_at')
        .eq('provider_id', providerId)
        .eq('source', 'google')
        .order('published_at', { ascending: false })
        .limit(60);

    if (recentRows && recentRows.length > 50) {
        const idsToDelete = recentRows.slice(50).map((r: any) => r.id);
        if (idsToDelete.length > 0) {
            await adminSupabase.from('reviews').delete().in('id', idsToDelete);
        }
    }

    const { data: summarySourceRows } = await adminSupabase
        .from('reviews')
        .select('rating, body')
        .eq('provider_id', providerId)
        .eq('source', 'google')
        .order('published_at', { ascending: false })
        .limit(50);

    if (summarySourceRows && summarySourceRows.length > 0) {
        const reviewSummary = await summarizeReviews({
            providerName: providerRow.name,
            rating: providerRow.rating,
            ratingCount: providerRow.rating_count,
            reviews: summarySourceRows.map((r: any) => ({
                rating: typeof r.rating === 'number' ? r.rating : null,
                text: { text: String(r.body || '') },
            })),
        });

        const summaryText = reviewSummary?.summary
            ? sanitizeCustomerSummary(reviewSummary.summary.trim())
            : '';

        if (summaryText) {
            await adminSupabase
                .from('providers')
                .update({ summary: summaryText })
                .eq('id', providerId);
        }
    }

    // Sync place photos to Supabase storage (gallery bucket) and provider_images table
    const placePhotos = (place.photos || []) as Array<{ name?: string }>;
    const maxPhotos = 10;
    for (let i = 0; i < Math.min(placePhotos.length, maxPhotos); i++) {
        const photo = placePhotos[i];
        const photoName = typeof photo?.name === 'string' ? photo.name.trim() : '';
        if (!photoName || !photoName.includes('/photos/')) continue;

        try {
            const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&key=${encodeURIComponent(apiKey)}`;
            const mediaRes = await fetch(mediaUrl, { redirect: 'follow' });
            if (!mediaRes.ok) continue;
            const contentType = mediaRes.headers.get('content-type') || 'image/jpeg';
            const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
            const bytes = await mediaRes.arrayBuffer();
            if (bytes.byteLength === 0) continue;

            const slug = photoName.split('/photos/')[1]?.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `photo-${i}`;
            const path = `providers/${providerId}/${slug}.${ext}`;

            const { error: uploadErr } = await adminSupabase.storage
                .from('gallery')
                .upload(path, bytes, { contentType, upsert: true });

            if (uploadErr) {
                if (process.env.NODE_ENV === 'development') {
                     
                    console.warn('Gallery upload failed for', photoName.slice(0, 50), uploadErr.message);
                }
                continue;
            }

            const sourceRef = photoName.slice(0, 512);
            await adminSupabase.from('provider_images').upsert(
                {
                    provider_id: providerId,
                    source: 'google',
                    source_ref: sourceRef,
                    bucket: 'gallery',
                    path,
                    sort_order: i,
                    status: 'approved',
                },
                { onConflict: 'provider_id,source,source_ref' }
            );
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                 
                console.warn('Photo sync failed for', photoName.slice(0, 50), (e as Error)?.message);
            }
        }
        await new Promise((r) => setTimeout(r, 200));
    }

    const { data: savedRow, error: selectError } = await adminSupabase
        .from('providers')
        .select('*')
        .eq('id', providerId)
        .single();

    const provider = (selectError || !savedRow)
        ? ({ id: providerId, ...providerRow } as Record<string, unknown>)
        : (savedRow as Record<string, unknown>);

    return { ok: true, providerId, provider };
}
