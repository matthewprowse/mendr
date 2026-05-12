import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { RETAIL_TYPES } from '@/app/api/providers/constants';
import { normalizePlaceId } from '@/app/api/providers/place-id';

const DEFAULT_LAT = -33.9249;
const DEFAULT_LNG = 18.4241;
const BIAS_RADIUS_M = 85_000;

function getPlacesApiKey(): string | null {
    return (
        process.env.GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        null
    );
}

type SearchBody = {
    query?: string;
    lat?: number;
    lng?: number;
};

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

    const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : DEFAULT_LAT;
    const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : DEFAULT_LNG;

    const apiKey = getPlacesApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: 'Places search is not configured.' }, { status: 500 });
    }

    const url = 'https://places.googleapis.com/v1/places:searchText';
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.types,places.location,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
            textQuery: q,
            regionCode: 'ZA',
            locationBias: {
                circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: BIAS_RADIUS_M,
                },
            },
            pageSize: 15,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[onboarding/search] Places error:', response.status, errorText);
        return NextResponse.json({ error: 'Could not search businesses. Try again in a moment.' }, { status: 502 });
    }

    const data = (await response.json()) as { places?: unknown[] };
    const rawPlaces = Array.isArray(data.places) ? data.places : [];

    const results: Array<{
        placeId: string;
        name: string;
        address: string;
        types: string[];
        rating: number | null;
        userRatingCount: number | null;
    }> = [];

    for (const p of rawPlaces as any[]) {
        const types = (p?.types || []) as string[];
        if (types.some((t) => RETAIL_TYPES.has(t))) continue;

        const rawId = typeof p?.id === 'string' ? p.id : '';
        if (!rawId) continue;
        const placeId = normalizePlaceId(rawId);
        const name = (p?.displayName?.text as string) || (p?.displayName as string) || 'Business';
        const address = (p?.formattedAddress as string) || '';
        results.push({
            placeId,
            name,
            address,
            types,
            rating: typeof p?.rating === 'number' ? p.rating : null,
            userRatingCount: typeof p?.userRatingCount === 'number' ? p.userRatingCount : null,
        });
    }

    return NextResponse.json({ results });
}
