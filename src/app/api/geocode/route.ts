import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

/** Western Cape, South Africa bounds (approx): SW lat,lng | NE lat,lng */
const WESTERN_CAPE_BOUNDS = {
    south: -35,
    west: 17,
    north: -31,
    east: 26,
};

const GEOCODE_CACHE_DAYS = 30;

function isInWesternCape(lat: number, lng: number): boolean {
    return (
        lat >= WESTERN_CAPE_BOUNDS.south &&
        lat <= WESTERN_CAPE_BOUNDS.north &&
        lng >= WESTERN_CAPE_BOUNDS.west &&
        lng <= WESTERN_CAPE_BOUNDS.east
    );
}

function geocodeCacheKey(address: string | undefined, lat: number | undefined, lng: number | undefined): string {
    if (address && typeof address === 'string') {
        return `address:${address.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    }
    if (typeof lat === 'number' && typeof lng === 'number') {
        return `latlng:${lat.toFixed(5)},${lng.toFixed(5)}`;
    }
    return '';
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { address, lat: inputLat, lng: inputLng } = body;

        const latNum = inputLat != null ? Number(inputLat) : undefined;
        const lngNum = inputLng != null ? Number(inputLng) : undefined;
        if (address) {
            if (latNum != null && lngNum != null && !isInWesternCape(latNum, lngNum)) {
                return NextResponse.json(
                    { error: 'Location must be in Western Cape, South Africa' },
                    { status: 400 }
                );
            }
        } else if (latNum != null && lngNum != null && !isInWesternCape(latNum, lngNum)) {
            return NextResponse.json(
                { error: 'Location must be in Western Cape, South Africa' },
                { status: 400 }
            );
        }

        const queryKey = geocodeCacheKey(address, latNum, lngNum);
        if (queryKey) {
            try {
                const supabase = await createSupabaseServerClient();
                const cutoff = new Date(Date.now() - GEOCODE_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
                const { data: cached } = await supabase
                    .from('geocode_cache')
                    .select('lat, lng, address')
                    .eq('query_key', queryKey)
                    .gt('created_at', cutoff)
                    .maybeSingle();
                if (cached) {
                    return NextResponse.json({
                        lat: cached.lat,
                        lng: cached.lng,
                        address: cached.address,
                    });
                }
            } catch {
                // no cache; fall through to Google
            }
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        const components = encodeURIComponent('administrative_area:Western Cape|country:ZA');
        let url = '';

        if (address) {
            url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=${components}&bounds=${WESTERN_CAPE_BOUNDS.south},${WESTERN_CAPE_BOUNDS.west}|${WESTERN_CAPE_BOUNDS.north},${WESTERN_CAPE_BOUNDS.east}&key=${apiKey}`;
        } else if (latNum != null && lngNum != null) {
            url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&key=${apiKey}`;
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

        if (queryKey) {
            try {
                const admin = await createSupabaseAdminClient();
                await admin.from('geocode_cache').upsert(
                    { query_key: queryKey, lat, lng, address: formattedAddress },
                    { onConflict: 'query_key' }
                );
            } catch {
                // ignore cache write failure
            }
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
