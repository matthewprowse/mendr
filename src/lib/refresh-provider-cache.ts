/**
 * Refresh a single cached provider from Google Place Details.
 * Call when cache is older than CACHE_STALE_DAYS so reviews and opening hours stay current.
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server';

export const CACHE_STALE_DAYS = 14;

const PLACE_DETAILS_FIELDS =
    'id,displayName,formattedAddress,addressComponents,rating,userRatingCount,nationalPhoneNumber,internationalPhoneNumber,websiteUri,location,editorialSummary,reviewSummary,types,reviews,regularOpeningHours,photos';

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
    }>;
    weekday_descriptions: string[];
};

/**
 * Fetch place details from Google and upsert into cached_providers.
 * Preserves existing summary and services; updates all Google-sourced fields and last_updated.
 * Returns the fetched reviews and opening hours so the caller can use them even if the DB update fails.
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

    const rawReviews = place.reviews ?? [];
    const reviews = rawReviews
        .map((r: any) => {
            const text = typeof r.text === 'string' ? r.text : (r.text?.text ?? '');
            const authorName =
                (r.authorAttribution?.displayName && String(r.authorAttribution.displayName).trim()) ||
                null;
            const media = Array.isArray(r.media)
                ? (r.media as any[])
                      .map((m: any) => (m?.name ? { name: String(m.name) } : null))
                      .filter(Boolean) as { name: string }[]
                : undefined;
            return {
                text,
                rating: r.rating ?? null,
                relativePublishTimeDescription: r.relativePublishTimeDescription ?? null,
                authorName: authorName || 'Google user',
                ...(media?.length ? { media } : {}),
            };
        })
        .filter((r: { text: string }) => r.text?.trim());

    const weekdayDescriptions: string[] = place.regularOpeningHours?.weekdayDescriptions ?? [];
    const photos: Array<{ name: string }> = (place.photos ?? []).slice(0, 10).map((p: { name?: string }) => ({ name: p?.name || '' })).filter((p: { name: string }) => p.name);
    const name = place.displayName?.text || 'Unknown Provider';
    const storedPlaceId = place.id ? (place.id.startsWith('places/') ? place.id : `places/${place.id}`) : placeId;

    const admin = await createSupabaseAdminClient();

    // Preserve existing row's summary, services, id
    const { data: existingA } = await admin
        .from('cached_providers')
        .select('place_id, id, summary, services')
        .eq('place_id', storedPlaceId)
        .maybeSingle();

    const existingB = !existingA
        ? await admin
              .from('cached_providers')
              .select('place_id, id, summary, services')
              .eq('place_id', normalizePlaceId(placeId))
              .maybeSingle()
        : null;

    const row = existingA ?? existingB?.data ?? null;
    const existingPlaceId = row?.place_id ?? storedPlaceId;
    const existingId = row?.id ?? crypto.randomUUID();

    const payload = {
        place_id: existingPlaceId,
        id: existingId,
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
        reviews,
        weekday_descriptions: weekdayDescriptions,
        photos,
        last_updated: new Date().toISOString(),
    };

    const { error } = await admin.from('cached_providers').upsert(payload, {
        onConflict: 'place_id',
    });

    if (error) {
        console.warn('refreshCachedProvider: upsert failed', error.message);
        return { ok: false, reviews, weekday_descriptions: weekdayDescriptions };
    }
    return { ok: true, reviews, weekday_descriptions: weekdayDescriptions };
}
