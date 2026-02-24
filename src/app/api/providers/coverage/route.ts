import { NextRequest, NextResponse } from 'next/server';

const CAPE_TOWN = { lat: -33.9249, lng: 18.4241 };
const RADIUS_M = 25000; // 25km

const TRADE_QUERIES = ['Plumber', 'Electrician', 'Gate repair', 'Roofing contractor'];

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { lat, lng } = body;
        const center =
            lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : CAPE_TOWN;

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google Places API key is not configured' },
                { status: 500 }
            );
        }

        const seenPlaceIds = new Set<string>();
        const allProviders: Array<{
            place_id: string;
            name: string;
            address: string;
            latitude?: number;
            longitude?: number;
            rating?: number;
            ratingCount?: number;
        }> = [];

        for (const query of TRADE_QUERIES) {
            const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask':
                        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location',
                },
                body: JSON.stringify({
                    textQuery: `${query} Cape Town`,
                    locationBias: {
                        circle: {
                            center: { latitude: center.lat, longitude: center.lng },
                            radius: RADIUS_M,
                        },
                    },
                    pageSize: 20,
                }),
            });

            if (!response.ok) continue;

            const data = await response.json();
            const places = data.places || [];

            for (const p of places) {
                if (seenPlaceIds.has(p.id)) continue;
                seenPlaceIds.add(p.id);

                allProviders.push({
                    place_id: p.id,
                    name: p.displayName?.text || 'Unknown',
                    address: p.formattedAddress || '',
                    latitude: p.location?.latitude,
                    longitude: p.location?.longitude,
                    rating: p.rating,
                    ratingCount: p.userRatingCount ?? 0,
                });
            }
        }

        return NextResponse.json({ providers: allProviders });
    } catch (error: unknown) {
        console.error('Coverage providers error:', error);
        return NextResponse.json(
            { error: (error as Error).message || 'Failed to fetch providers' },
            { status: 500 }
        );
    }
}
