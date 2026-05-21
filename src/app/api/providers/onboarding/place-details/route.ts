// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GOOGLE_MAPS_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { normalizePlaceId } from '@/lib/providers/place-id';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FIELD_MASK =
    'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,location,types,rating,userRatingCount,generativeSummary,editorialSummary';

function getPlacesApiKey(): string | null {
    return (
        process.env.GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        null
    );
}

export type OnboardingPlaceDetailsPayload = {
    placeId: string;
    businessName: string;
    address: string;
    phone: string | null;
    website: string | null;
    lat: number | null;
    lng: number | null;
    types: string[];
    rating: number | null;
    userRatingCount: number | null;
};

type Body = { placeId?: string };

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'onboardingPlaceDetails');
    if (limited) return limited;

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const raw = typeof body.placeId === 'string' ? body.placeId.trim() : '';
    if (!raw) {
        return NextResponse.json({ error: 'placeId is required.' }, { status: 400 });
    }

    const idCore = normalizePlaceId(raw);
    const cacheKey = `places/${idCore}`;

    try {
        const admin = await createSupabaseAdminClient();
        const { data: row } = await admin
            .from('onboarding_place_details_cache')
            .select('payload, fetched_at')
            .eq('place_id', cacheKey)
            .maybeSingle();

        if (row?.payload && row.fetched_at) {
            const age = Date.now() - new Date(row.fetched_at as string).getTime();
            if (age >= 0 && age < CACHE_TTL_MS) {
                return NextResponse.json({ details: row.payload as OnboardingPlaceDetailsPayload, cached: true });
            }
        }
    } catch {
        /* cache optional */
    }

    const apiKey = getPlacesApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: 'Place details are not configured.' }, { status: 500 });
    }

    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(idCore)}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
        },
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[onboarding/place-details] Places error:', response.status, errorText);
        return NextResponse.json({ error: 'Could not load business details.' }, { status: 502 });
    }

    const place = (await response.json()) as Record<string, unknown>;
    const apiId = typeof place.id === 'string' ? normalizePlaceId(place.id) : idCore;
    const normalizedPlaceId = apiId.startsWith('places/') ? apiId : `places/${apiId}`;

    const details: OnboardingPlaceDetailsPayload = {
        placeId: normalizedPlaceId,
        businessName: String((place.displayName as { text?: string })?.text ?? place.displayName ?? ''),
        address: String(place.formattedAddress ?? ''),
        phone: typeof place.nationalPhoneNumber === 'string' ? place.nationalPhoneNumber : null,
        website: typeof place.websiteUri === 'string' ? place.websiteUri : null,
        lat: typeof (place.location as { latitude?: number })?.latitude === 'number'
            ? (place.location as { latitude: number }).latitude
            : null,
        lng: typeof (place.location as { longitude?: number })?.longitude === 'number'
            ? (place.location as { longitude: number }).longitude
            : null,
        types: Array.isArray(place.types) ? (place.types as string[]) : [],
        rating: typeof place.rating === 'number' ? place.rating : null,
        userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    };

    try {
        const admin = await createSupabaseAdminClient();
        void admin
            .from('onboarding_place_details_cache')
            .upsert(
                {
                    place_id: cacheKey,
                    payload: details,
                    fetched_at: new Date().toISOString(),
                },
                { onConflict: 'place_id' }
            )
            .then(({ error }) => {
                if (error) console.warn('[onboarding/place-details] cache write:', error.message);
            });
    } catch {
        /* ignore */
    }

    return NextResponse.json({ details, cached: false });
}
