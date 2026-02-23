import { NextRequest, NextResponse } from 'next/server';

const CAPE_TOWN = { lat: -33.9249, lng: 18.4241 };

export async function POST(req: NextRequest) {
    try {
        const { query, lat, lng } = await req.json();

        if (!query || typeof query !== 'string' || !query.trim()) {
            return NextResponse.json(
                { error: 'Search query is required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google Places API key is not configured' },
                { status: 500 }
            );
        }

        const center = lat != null && lng != null ? { lat, lng } : CAPE_TOWN;

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                    'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location',
            },
            body: JSON.stringify({
                textQuery: query.trim(),
                locationBias: {
                    circle: {
                        center: { latitude: center.lat, longitude: center.lng },
                        radius: 50000,
                    },
                },
                pageSize: 15,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google Places search error:', errorText);
            return NextResponse.json(
                { error: 'Failed to search providers' },
                { status: 500 }
            );
        }

        const data = await response.json();
        const places = data.places || [];

        const providers = places.map((p: any) => ({
            place_id: p.id,
            name: p.displayName?.text || 'Unknown',
            address: p.formattedAddress || '',
            latitude: p.location?.latitude,
            longitude: p.location?.longitude,
            rating: p.rating,
            ratingCount: p.userRatingCount ?? 0,
        }));

        return NextResponse.json({ providers });
    } catch (error: any) {
        console.error('Provider search error:', error);
        return NextResponse.json(
            { error: error.message || 'Search failed' },
            { status: 500 }
        );
    }
}
