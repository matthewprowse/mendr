/**
 * Service area management for the logged-in contractor.
 *
 * GET  → returns the contractor's current service-area config (center + radius).
 * POST → saves a new center + radius for the contractor's matched provider row.
 *
 * The contractor is identified via Supabase auth; they may only edit the
 * provider_applications.matched_provider_id linked to their approved application.
 *
 * Rate-limited under the `accountLocations` bucket (existing low-frequency
 * logged-in account management bucket — service-area edits fit the same shape).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { planLimits, toPlanId } from '@/lib/pro/plans';

type ServiceAreaPayload = {
    lat: number | null;
    lng: number | null;
    radiusKm: number;
};

// Rough Western Cape bounding box — matches the map UI restriction so the
// server rejects payloads outside the supported region.
const WC_BOUNDS = { south: -34.6, west: 17.4, north: -32.4, east: 21.1 } as const;
const MIN_RADIUS_KM = 5;
const MAX_RADIUS_KM = 50;

function isInWesternCape(lat: number, lng: number): boolean {
    return (
        lat >= WC_BOUNDS.south &&
        lat <= WC_BOUNDS.north &&
        lng >= WC_BOUNDS.west &&
        lng <= WC_BOUNDS.east
    );
}

async function resolveProviderId(
    userId: string,
): Promise<{ providerId: string | null; reason?: string }> {
    const admin = await createSupabaseAdminClient();
    // Find the contractor's approved application with a matched provider.
    const { data: app } = await admin
        .from('provider_applications')
        .select('matched_provider_id, status')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .not('matched_provider_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!app?.matched_provider_id) {
        return {
            providerId: null,
            reason: 'No approved provider profile is linked to your account yet.',
        };
    }
    return { providerId: String(app.matched_provider_id) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountLocations');
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { providerId, reason } = await resolveProviderId(user.id);
    if (!providerId) {
        return NextResponse.json({ error: reason ?? 'Provider not found.' }, { status: 404 });
    }

    const admin = await createSupabaseAdminClient();
    const { data: provider, error } = await admin
        .from('providers')
        .select(
            'id, name, latitude, longitude, service_area_center_lat, service_area_center_lng, service_area_radius_km',
        )
        .eq('id', providerId)
        .maybeSingle();

    if (error || !provider) {
        return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
    }

    return NextResponse.json({
        providerId: provider.id,
        name: provider.name,
        // Fall back to the provider's geocoded business address when no service-area
        // centre is set yet, so the map opens somewhere sensible.
        suggestedLat: provider.latitude ?? null,
        suggestedLng: provider.longitude ?? null,
        serviceArea: {
            lat:
                typeof provider.service_area_center_lat === 'number'
                    ? provider.service_area_center_lat
                    : null,
            lng:
                typeof provider.service_area_center_lng === 'number'
                    ? provider.service_area_center_lng
                    : null,
            radiusKm:
                typeof provider.service_area_radius_km === 'number'
                    ? provider.service_area_radius_km
                    : 15,
        } satisfies ServiceAreaPayload,
    });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'accountLocations');
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
        lat?: unknown;
        lng?: unknown;
        radiusKm?: unknown;
    } | null;

    const lat = typeof body?.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body?.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
    const radiusKm =
        typeof body?.radiusKm === 'number' && Number.isFinite(body.radiusKm)
            ? Math.round(body.radiusKm)
            : null;

    if (lat == null || lng == null || radiusKm == null) {
        return NextResponse.json(
            { error: 'lat, lng, and radiusKm are required.' },
            { status: 400 },
        );
    }
    if (radiusKm < MIN_RADIUS_KM || radiusKm > MAX_RADIUS_KM) {
        return NextResponse.json(
            { error: `radiusKm must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM}.` },
            { status: 400 },
        );
    }
    if (!isInWesternCape(lat, lng)) {
        return NextResponse.json(
            { error: 'Service area centre must lie within the Western Cape.' },
            { status: 400 },
        );
    }

    const { providerId, reason } = await resolveProviderId(user.id);
    if (!providerId) {
        return NextResponse.json({ error: reason ?? 'Provider not found.' }, { status: 404 });
    }

    const admin = await createSupabaseAdminClient();

    // Plan-gated reach: cap the radius to the provider's plan.
    const { data: planRow } = await admin
        .from('providers')
        .select('plan')
        .eq('id', providerId)
        .maybeSingle();
    const maxRadiusKm = planLimits(
        toPlanId((planRow as { plan?: string } | null)?.plan),
    ).maxRadiusKm;
    if (radiusKm > maxRadiusKm) {
        return NextResponse.json(
            {
                error: `Your plan allows a service area up to ${maxRadiusKm} km. Upgrade your plan to cover more ground.`,
            },
            { status: 409 },
        );
    }
    const { error } = await admin
        .from('providers')
        .update({
            service_area_center_lat: lat,
            service_area_center_lng: lng,
            service_area_radius_km: radiusKm,
            updated_at: new Date().toISOString(),
        })
        .eq('id', providerId);

    if (error) {
        return NextResponse.json(
            { error: `Failed to save: ${error.message}` },
            { status: 500 },
        );
    }

    return NextResponse.json({ ok: true });
}
