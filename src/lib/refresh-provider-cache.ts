/**
 * Refresh a single provider from Google Place Details.
 * Call when cache is older than CACHE_STALE_DAYS so reviews, photos, and opening hours stay current.
 */

import { createHash } from 'crypto';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { analyseReviewsForProPage } from '@/lib/ai-review-metrics';

// Re-enrich Google providers weekly
export const CACHE_STALE_DAYS = 7;

const PLACE_DETAILS_FIELDS =
    'id,displayName,formattedAddress,addressComponents,rating,userRatingCount,nationalPhoneNumber,internationalPhoneNumber,websiteUri,location,editorialSummary,reviewSummary,types,reviews.name,reviews.text,reviews.rating,reviews.relativePublishTimeDescription,reviews.authorAttribution.displayName,regularOpeningHours,photos';

function normalizePlaceId(id: string): string {
    return (id || '').replace(/^places\//, '');
}

export function isCacheStale(lastUpdated: string | null | undefined): boolean {
    if (!lastUpdated) return true;
    const updated = new Date(lastUpdated).getTime();
    const cutoff = Date.now() - CACHE_STALE_DAYS * 24 * 60 * 60 * 1000;
    return updated < cutoff;
}

export type RefreshResult = {
    ok: boolean;
    reviews: Array<{
        text: string;
        rating: number | null;
        relativePublishTimeDescription?: string | null;
        authorName?: string | null;
        published_at?: string | null;
        source_ref?: string | null;
    }>;
    weekday_descriptions: string[];
};

/**
 * Fetch place details from Google and upsert into unified tables:
 * - providers (source=google)
 * - reviews (source=google)
 * - provider_images (source=google, stored in Supabase Storage bucket)
 */
export async function refreshCachedProvider(placeId: string): Promise<RefreshResult> {
    const emptyResult: RefreshResult = { ok: false, reviews: [], weekday_descriptions: [] };
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        console.warn('refreshCachedProvider: GOOGLE_PLACES_API_KEY missing');
        return emptyResult;
    }

    const idInPath = normalizePlaceId(placeId);
    const url = `https://places.googleapis.com/v1/places/${idInPath}`;

    let place: any;
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': PLACE_DETAILS_FIELDS,
            },
        });
        if (!res.ok) {
            const text = await res.text();
            console.warn('refreshCachedProvider: Google API error', res.status, text);
            return emptyResult;
        }
        place = await res.json();
    } catch (e) {
        console.warn('refreshCachedProvider: fetch failed', (e as Error).message);
        return emptyResult;
    }

    const components = place.addressComponents || [];
    const getComponent = (type: string) =>
        components.find((c: any) => c.types && c.types.includes(type))?.longText || '';
    const streetNumber = getComponent('street_number');
    const route = getComponent('route');
    const suburb = getComponent('sublocality_level_1') || getComponent('neighborhood');
    const town = getComponent('postal_town') || getComponent('locality');
    const county = getComponent('administrative_area_level_2');
    const shortAddress = [streetNumber && route ? `${streetNumber} ${route}` : route || '', suburb, town, county]
        .filter(Boolean)
        .join(', ');

    function derivePublishedAt(relative?: string | null): string | null {
        if (!relative) return null;
        const text = String(relative).trim().toLowerCase();
        const now = new Date();

        const yearMatch = text.match(/(\d+)\s+year/);
        if (yearMatch) {
            const years = parseInt(yearMatch[1] ?? '0', 10);
            if (!Number.isNaN(years) && years > 0) {
                const d = new Date(now);
                d.setFullYear(d.getFullYear() - years);
                return d.toISOString();
            }
        }

        const monthMatch = text.match(/(\d+)\s+month/);
        if (monthMatch) {
            const months = parseInt(monthMatch[1] ?? '0', 10);
            if (!Number.isNaN(months) && months > 0) {
                const d = new Date(now);
                d.setMonth(d.getMonth() - months);
                return d.toISOString();
            }
        }

        const weekMatch = text.match(/(\d+)\s+week/);
        if (weekMatch) {
            const weeks = parseInt(weekMatch[1] ?? '0', 10);
            if (!Number.isNaN(weeks) && weeks > 0) {
                const d = new Date(now);
                d.setDate(d.getDate() - weeks * 7);
                return d.toISOString();
            }
        }

        const dayMatch = text.match(/(\d+)\s+day/);
        if (dayMatch) {
            const days = parseInt(dayMatch[1] ?? '0', 10);
            if (!Number.isNaN(days) && days > 0) {
                const d = new Date(now);
                d.setDate(d.getDate() - days);
                return d.toISOString();
            }
        }

        return null;
    }

    const rawReviews = place.reviews ?? [];
    const reviews = rawReviews
        .map((r: any) => {
            const text = typeof r.text === 'string' ? r.text : (r.text?.text ?? '');
            const authorName =
                (r.authorAttribution?.displayName && String(r.authorAttribution.displayName).trim()) ||
                null;
            const relative = r.relativePublishTimeDescription ?? null;
            const media = Array.isArray(r.media)
                ? (r.media as any[])
                      .map((m: any) => (m?.name ? { name: String(m.name) } : null))
                      .filter(Boolean) as { name: string }[]
                : undefined;
            return {
                text,
                rating: r.rating ?? null,
                relativePublishTimeDescription: relative,
                authorName: authorName || 'Google user',
                published_at: derivePublishedAt(relative),
                source_ref: typeof r.name === 'string' ? r.name : null,
                ...(media?.length ? { media } : {}),
            };
        })
        .filter((r: { text: string }) => r.text?.trim());

    const weekdayDescriptions: string[] = place.regularOpeningHours?.weekdayDescriptions ?? [];
    const photos: Array<{ name: string }> = (place.photos ?? []).slice(0, 10).map((p: { name?: string }) => ({ name: p?.name || '' })).filter((p: { name: string }) => p.name);
    const name = place.displayName?.text || 'Unknown Provider';
    const storedPlaceId = place.id ? (place.id.startsWith('places/') ? place.id : `places/${place.id}`) : placeId;

    const admin = await createSupabaseAdminClient();

    // Preserve existing provider row's summary/services/id
    const { data: row } = await admin
        .from('providers')
        .select('id, google_place_id, summary, services, service_categories')
        .eq('google_place_id', storedPlaceId)
        .maybeSingle();

    const existingPlaceId = row?.google_place_id ?? storedPlaceId;
    const existingId = row?.id ?? crypto.randomUUID();

    // Unified providers table: upsert (reuse legacy id so /pro/[id] continues to work)
    try {
        const { data: existingProvider } = await admin
            .from('providers')
            .select('id')
            .eq('google_place_id', existingPlaceId)
            .maybeSingle();
        const providerId = existingProvider?.id ?? existingId;
        await admin.from('providers').upsert(
            {
                id: providerId,
                source: 'google',
                google_place_id: existingPlaceId,
                name,
                address: shortAddress || place.formattedAddress || null,
                rating: place.rating ?? null,
                rating_count: place.userRatingCount ?? null,
                phone: place.nationalPhoneNumber ?? null,
                website: place.websiteUri ?? null,
                latitude: place.location?.latitude ?? null,
                longitude: place.location?.longitude ?? null,
                summary: row?.summary ?? null,
                services: (row?.services as any) ?? [],
                service_categories: (row?.service_categories as any) ?? [],
                weekday_descriptions: weekdayDescriptions,
                last_updated: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'google_place_id' }
        );

        // Persist unified reviews (source=google)
        if (reviews.length > 0) {
            const nowIso = new Date().toISOString();
            const rows = reviews.map((r: {
                text: string;
                rating: number | null;
                relativePublishTimeDescription?: string | null;
                authorName?: string | null;
                published_at?: string | null;
                source_ref?: string | null;
            }) => {
                const sourceRef =
                    (r.source_ref && r.source_ref.trim()) ||
                    createHash('sha1')
                        .update(
                            [
                                existingPlaceId,
                                (r.authorName || '').trim(),
                                (r.published_at || '').trim(),
                                (r.relativePublishTimeDescription || '').trim(),
                                (r.text || '').trim(),
                            ].join('|')
                        )
                        .digest('hex');
                return {
                    provider_id: providerId,
                    source: 'google',
                    source_ref: sourceRef,
                    reviewer_name: r.authorName || null,
                    rating: typeof r.rating === 'number' ? Math.round(r.rating) : null,
                    body: r.text,
                    status: 'approved',
                    relative_publish_time_description: r.relativePublishTimeDescription ?? null,
                    published_at: r.published_at ?? null,
                    raw: null,
                    updated_at: nowIso,
                };
            });
            await admin.from('reviews').upsert(rows, { onConflict: 'source,source_ref' });

            // Re-run AI summary/highlights for this Google provider using latest reviews (weekly, on refresh).
            const geminiKey = process.env.GEMINI_API_KEY;
            if (geminiKey) {
                try {
                    const analysis = await analyseReviewsForProPage(
                        reviews.map((r: { text: string; rating: number | null }) => ({
                            text: r.text,
                            rating: r.rating ?? undefined,
                        })),
                        geminiKey
                    );
                    await admin
                        .from('providers')
                        .update({
                            ai_review_summary: analysis.summary,
                            review_categories: analysis.reviewCategories,
                            review_highlights: analysis.highlights,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', providerId);
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        'refreshCachedProvider: review analysis failed',
                        (e as Error).message
                    );
                }
            }
        }

        // Persist provider photos into Storage + provider_images (best-effort, only new ones)
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        const photosRaw: Array<{ name?: string }> = Array.isArray(place.photos) ? place.photos : [];
        const photoNames = photosRaw
            .map((p) => p?.name)
            .filter((n): n is string => typeof n === 'string' && n.startsWith('places/'))
            .slice(0, 8);

        if (apiKey && photoNames.length > 0) {
            // Fetch existing Google-sourced images so we only add new ones.
            const { data: existingImages } = await admin
                .from('provider_images')
                .select('source_ref')
                .eq('provider_id', providerId)
                .eq('source', 'google');
            const existingRefs = new Set(
                (existingImages ?? [])
                    .map((img: any) => (typeof img?.source_ref === 'string' ? img.source_ref : null))
                    .filter((v): v is string => !!v)
            );

            for (let idx = 0; idx < photoNames.length; idx++) {
                const photoName = photoNames[idx]!;
                if (existingRefs.has(photoName)) continue; // already stored, skip
                try {
                    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?key=${encodeURIComponent(
                        apiKey
                    )}&maxWidthPx=1200&skipHttpRedirect=true`;
                    const mediaRes = await fetch(mediaUrl, { cache: 'no-store' });
                    if (!mediaRes.ok) continue;
                    const mediaJson = (await mediaRes.json().catch(() => null)) as
                        | { photoUri?: string }
                        | null;
                    const photoUri = mediaJson?.photoUri;
                    if (!photoUri) continue;

                    const imgRes = await fetch(photoUri, { cache: 'no-store' });
                    if (!imgRes.ok) continue;
                    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                    const ext =
                        contentType.includes('png')
                            ? 'png'
                            : contentType.includes('webp')
                              ? 'webp'
                              : 'jpg';
                    const bytes = Buffer.from(await imgRes.arrayBuffer());
                    const hash = createHash('sha1').update(photoName).digest('hex');
                    const path = `providers/${providerId}/${hash}.${ext}`;

                    const upload = await admin.storage
                        .from('gallery')
                        .upload(path, bytes, { contentType, upsert: true });
                    if (upload.error) continue;

                    await admin.from('provider_images').upsert(
                        {
                            provider_id: providerId,
                            source: 'google',
                            source_ref: photoName,
                            bucket: 'gallery',
                            path,
                            sort_order: idx,
                            created_at: new Date().toISOString(),
                        },
                        { onConflict: 'provider_id,source,source_ref' }
                    );
                } catch {
                    // ignore photo failures
                }
            }
        }
    } catch (e) {
        console.warn('refreshCachedProvider: providers/reviews/images upsert skipped', (e as Error).message);
        return { ok: false, reviews, weekday_descriptions: weekdayDescriptions };
    }
    return { ok: true, reviews, weekday_descriptions: weekdayDescriptions };
}
