// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GOOGLE_MAPS_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

type GeocodeRequestBody = {
    lat?: number;
    lng?: number;
    address?: string;
    westernCapeOnly?: boolean;
};

const WESTERN_CAPE_COMPONENTS = 'country:ZA|administrative_area:Western Cape';
const GEOCODE_CACHE_DAYS = 30;

type GeocoderResult = {
    geometry?: { location?: { lat?: number; lng?: number } };
    formatted_address?: string;
    address_components?: Array<{
        long_name?: string;
        short_name?: string;
        types?: string[];
    }>;
};

function resultIsInWesternCape(result: {
    address_components?: Array<{
        long_name?: string;
        short_name?: string;
        types?: string[];
    }>;
}): boolean {
    const comps = result.address_components;
    if (!Array.isArray(comps)) return false;
    for (const c of comps) {
        if (!c?.types?.includes('administrative_area_level_1')) continue;
        const longName = (c.long_name ?? '').toLowerCase();
        const shortName = c.short_name ?? '';
        if (longName.includes('western cape')) return true;
        if (shortName === 'WC') return true;
    }
    return false;
}

function getMapsApiKey(): string {
    return (
        process.env.GOOGLE_PLACES_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        ''
    );
}

function normalizeAddress(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function roundCoord(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function buildGeocodeCacheKey(input: {
    hasCoords: boolean;
    lat?: number;
    lng?: number;
    address?: string;
    westernCapeOnly: boolean;
}): string {
    const wc = input.westernCapeOnly ? 'wc1' : 'wc0';
    if (input.hasCoords) {
        const lat = roundCoord(Number(input.lat));
        const lng = roundCoord(Number(input.lng));
        return `coord:${lat},${lng}:${wc}`;
    }
    const address = normalizeAddress(String(input.address ?? ''));
    return `addr:${address}:${wc}`;
}

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'geocode');
    if (limited) return limited;

    const apiKey = getMapsApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: 'Geocoding API not configured' }, { status: 500 });
    }

    const body = (await req.json().catch(() => null)) as GeocodeRequestBody | null;
    if (!body) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const hasCoords = typeof body.lat === 'number' && typeof body.lng === 'number';
    const hasAddress = typeof body.address === 'string' && body.address.trim().length > 0;
    const westernCapeOnly = body.westernCapeOnly === true;

    if (!hasCoords && !hasAddress) {
        return NextResponse.json(
            { error: 'Provide either lat/lng or address' },
            { status: 400 }
        );
    }

    const cacheKey = buildGeocodeCacheKey({
        hasCoords,
        lat: body.lat,
        lng: body.lng,
        address: body.address,
        westernCapeOnly,
    });

    try {
        const admin = await createSupabaseAdminClient();
        const cutoff = new Date(Date.now() - GEOCODE_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await admin
            .from('geocode_cache')
            .select('response, created_at')
            .eq('cache_key', cacheKey)
            .gt('created_at', cutoff)
            .maybeSingle();

        const payload = cached?.response as { lat?: number; lng?: number; address?: string } | null;
        if (
            payload &&
            typeof payload.lat === 'number' &&
            typeof payload.lng === 'number' &&
            typeof payload.address === 'string'
        ) {
            return NextResponse.json({
                lat: payload.lat,
                lng: payload.lng,
                address: payload.address,
                cacheHit: true,
            });
        }
    } catch {
        // Non-fatal: if cache query fails, continue to Google.
    }

    try {
        const params = new URLSearchParams();
        params.set('key', apiKey);

        if (hasCoords) {
            params.set('latlng', `${body.lat},${body.lng}`);
            if (westernCapeOnly) {
                params.set('region', 'za');
            }
        } else {
            params.set('address', body.address!.trim());
            if (westernCapeOnly) {
                params.set('components', WESTERN_CAPE_COMPONENTS);
                params.set('region', 'za');
            }
        }

        const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(
                { error: 'Geocoding request failed' },
                { status: response.status }
            );
        }

        if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
            // 422 (not 404): route exists; this is an empty / failed geocode result — avoids DevTools
            // looking like a missing `/api/geocode` handler.
            return NextResponse.json(
                {
                    error:
                        westernCapeOnly && hasAddress
                            ? 'No match in the Western Cape. Try a fuller street address in Western Cape, South Africa.'
                            : data.error_message || 'No geocoding results found',
                },
                { status: 422 }
            );
        }

        const wcMsg =
            'That location is outside the Western Cape. Please use an address in Western Cape, South Africa.';
        const wcAddressHint =
            'No match in the Western Cape. Try a fuller street address in Western Cape, South Africa.';

        let chosen = data.results[0] as GeocoderResult;

        if (westernCapeOnly && hasCoords) {
            const inWc = (data.results as GeocoderResult[]).find((r) => resultIsInWesternCape(r));
            if (!inWc) {
                return NextResponse.json({ error: wcMsg }, { status: 422 });
            }
            chosen = inWc;
        } else if (westernCapeOnly && hasAddress) {
            const inWc = (data.results as GeocoderResult[]).find((r) => resultIsInWesternCape(r));
            if (!inWc) {
                return NextResponse.json({ error: wcAddressHint }, { status: 422 });
            }
            chosen = inWc;
        }

        const lat = chosen?.geometry?.location?.lat;
        const lng = chosen?.geometry?.location?.lng;
        const address = chosen?.formatted_address;

        if (typeof lat !== 'number' || typeof lng !== 'number') {
            return NextResponse.json({ error: 'Invalid geocoding response' }, { status: 502 });
        }

        try {
            const admin = await createSupabaseAdminClient();
            await admin.from('geocode_cache').upsert(
                {
                    cache_key: cacheKey,
                    response: {
                        lat,
                        lng,
                        address: typeof address === 'string' ? address : '',
                    },
                },
                { onConflict: 'cache_key' }
            );
        } catch {
            // Non-fatal: cache write failures should never fail geocoding.
        }

        return NextResponse.json({
            lat,
            lng,
            address: typeof address === 'string' ? address : undefined,
            cacheHit: false,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to geocode request';
        return NextResponse.json(
            { error: msg },
            { status: 500 }
        );
    }
}
