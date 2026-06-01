/**
 * Geocoding reuse layer for the WhatsApp bot.
 *
 * Lets the bot accept a free-text address typed in chat and turn it into
 * coordinates by reusing the existing `POST /api/geocode` handler via an
 * internal server-side fetch (same pattern as contractor-matcher). This is what
 * allows in-chat address entry instead of forcing the user to the web form.
 */

import { getAppOrigin } from '@/lib/site-url';

export interface GeocodeResult {
    lat: number;
    lng: number;
    address: string;
}

function resolveOrigin(requestOrigin?: string | null): string {
    if (requestOrigin && /^https?:\/\//.test(requestOrigin)) return requestOrigin;
    return getAppOrigin();
}

/**
 * Geocode a free-text address (Western Cape only, matching the app's coverage).
 * Returns null when the input is too short, no match is found, or the geocoder
 * errors — callers should treat null as "ask again", never as a crash.
 */
export async function geocodeAddress(
    address: string,
    opts?: { requestOrigin?: string | null },
): Promise<GeocodeResult | null> {
    const trimmed = address.trim();
    if (trimmed.length < 4) return null;
    const origin = resolveOrigin(opts?.requestOrigin);
    try {
        const res = await fetch(`${origin}/api/geocode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: trimmed, westernCapeOnly: true }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as {
            lat?: unknown;
            lng?: unknown;
            address?: unknown;
        };
        if (typeof body.lat === 'number' && typeof body.lng === 'number') {
            return {
                lat: body.lat,
                lng: body.lng,
                address: typeof body.address === 'string' ? body.address : trimmed,
            };
        }
        return null;
    } catch {
        return null;
    }
}
