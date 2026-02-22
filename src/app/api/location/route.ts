import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns approximate lat/lng from the client's IP address.
 * Used as fallback when browser geolocation fails (e.g. on mobile, user denial).
 */
export async function GET(req: NextRequest) {
    try {
        const forwarded = req.headers.get('x-forwarded-for');
        const realIp = req.headers.get('x-real-ip');
        const ip = forwarded?.split(',')[0]?.trim() || realIp || null;

        const url = ip
            ? `https://reallyfreegeoip.org/json/${ip}`
            : 'https://reallyfreegeoip.org/json/';

        const res = await fetch(url, { next: { revalidate: 0 } });
        const data = await res.json();

        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);

        if (isNaN(lat) || isNaN(lng)) {
            return NextResponse.json(
                { error: 'Could not determine location' },
                { status: 400 }
            );
        }

        const city = data.city || data.region_name || data.country_name || 'Unknown';
        return NextResponse.json({
            lat,
            lng,
            address: city,
        });
    } catch (error: any) {
        console.error('IP location failed:', error);
        const fallbackLat = parseFloat(process.env.DEFAULT_LOCATION_LAT || '-26.2041');
        const fallbackLng = parseFloat(process.env.DEFAULT_LOCATION_LNG || '28.0473');
        if (!isNaN(fallbackLat) && !isNaN(fallbackLng)) {
            return NextResponse.json({
                lat: fallbackLat,
                lng: fallbackLng,
                address: 'Approximate location',
            });
        }
        return NextResponse.json(
            { error: 'Could not determine location' },
            { status: 500 }
        );
    }
}
