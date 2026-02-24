import { NextRequest, NextResponse } from 'next/server';

/** Western Cape, South Africa bounds (approx): SW lat,lng | NE lat,lng */
const WESTERN_CAPE_BOUNDS = {
    south: -35,
    west: 17,
    north: -31,
    east: 26,
};

function isInWesternCape(lat: number, lng: number): boolean {
    return (
        lat >= WESTERN_CAPE_BOUNDS.south &&
        lat <= WESTERN_CAPE_BOUNDS.north &&
        lng >= WESTERN_CAPE_BOUNDS.west &&
        lng <= WESTERN_CAPE_BOUNDS.east
    );
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { address, lat: inputLat, lng: inputLng } = body;

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        const components = encodeURIComponent('administrative_area:Western Cape|country:ZA');
        let url = '';

        if (address) {
            url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=${components}&bounds=${WESTERN_CAPE_BOUNDS.south},${WESTERN_CAPE_BOUNDS.west}|${WESTERN_CAPE_BOUNDS.north},${WESTERN_CAPE_BOUNDS.east}&key=${apiKey}`;
        } else if (inputLat != null && inputLng != null) {
            const lat = Number(inputLat);
            const lng = Number(inputLng);
            if (!isInWesternCape(lat, lng)) {
                return NextResponse.json(
                    { error: 'Location must be in Western Cape, South Africa' },
                    { status: 400 }
                );
            }
            url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
        } else {
            return NextResponse.json(
                { error: 'Address or coordinates are required' },
                { status: 400 }
            );
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'ZERO_RESULTS') {
            return NextResponse.json(
                {
                    error: 'No address found in Western Cape, South Africa. Please search for a location in the Western Cape.',
                },
                { status: 400 }
            );
        }

        if (data.status !== 'OK') {
            return NextResponse.json(
                { error: data.error_message || 'Failed to find location' },
                { status: 400 }
            );
        }

        const result = data.results[0];
        const location = result.geometry.location;
        const formattedAddress = result.formatted_address;
        const lat = location.lat;
        const lng = location.lng;

        if (!isInWesternCape(lat, lng)) {
            return NextResponse.json(
                { error: 'Address must be in Western Cape, South Africa' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            lat,
            lng,
            address: formattedAddress,
        });
    } catch (error: any) {
        console.error('Geocoding Error:', error);
        return NextResponse.json({ error: 'Failed to geocode address' }, { status: 500 });
    }
}
