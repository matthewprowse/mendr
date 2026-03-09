import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { SERVICE_LABELS } from '@/lib/services';

function haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');
        const category = searchParams.get('category') ?? '';

        const latNum = lat ? parseFloat(lat) : null;
        const lngNum = lng ? parseFloat(lng) : null;

        if (latNum == null || lngNum == null || isNaN(latNum) || isNaN(lngNum)) {
            return NextResponse.json(
                { error: 'Missing or invalid lat/lng' },
                { status: 400 }
            );
        }

        const supabase = await createSupabaseServerClient();

        const { data: locations, error: locError } = await supabase
            .from('provider_locations')
            .select('id, provider_id, nickname, address, latitude, longitude, service_radius_km')
            .eq('is_active', true);

        if (locError) {
            console.error('provider_locations error:', locError);
            return NextResponse.json(
                { error: 'Failed to fetch pros', pros: [] },
                { status: 200 }
            );
        }

        const providerIds = [...new Set((locations ?? []).map((l: any) => l.provider_id).filter(Boolean))];
        let profilesMap: Record<string, any> = {};
        if (providerIds.length > 0) {
            const { data: profiles } = await supabase
                .from('provider_profiles')
                .select('id, slug, short_description, banner_url, service_categories, ai_review_summary, positives, negatives, metrics_punctuality, metrics_tidiness, metrics_professionalism, metrics_cleanup, total_jobs_completed, google_place_id')
                .in('id', providerIds);
            (profiles ?? []).forEach((p: any) => {
                profilesMap[p.id] = p;
            });
        }

        const canonicalServices = new Set<string>(SERVICE_LABELS);
        const invalidProviderIds = new Set<string>();

        const withDistance = (locations ?? [])
            .filter((loc: any) => {
                const locLat = loc.latitude != null ? Number(loc.latitude) : null;
                const locLng = loc.longitude != null ? Number(loc.longitude) : null;
                if (locLat == null || locLng == null) return false;
                const radiusKm = Number(loc.service_radius_km ?? 25);
                const dist = haversineKm(latNum, lngNum, locLat, locLng);
                return dist <= radiusKm;
            })
            .map((loc: any) => {
                const locLat = loc.latitude != null ? Number(loc.latitude) : null;
                const locLng = loc.longitude != null ? Number(loc.longitude) : null;
                const dist =
                    locLat != null && locLng != null
                        ? haversineKm(latNum, lngNum, locLat, locLng)
                        : null;

                const profile = profilesMap[loc.provider_id];
                const rawCategories = (profile?.service_categories ?? []) as string[];
                const hasValidCategory = rawCategories.some((cat) =>
                    canonicalServices.has(cat)
                );

                if (!hasValidCategory) {
                    invalidProviderIds.add(loc.provider_id);
                }

                return { ...loc, distance_km: dist, profile };
            });

        // Drop providers whose service categories are empty or contain only non-canonical values.
        let filtered = withDistance.filter(
            (loc: any) => !invalidProviderIds.has(loc.provider_id)
        );
        if (category && category.trim() !== '') {
            const catLower = category.trim().toLowerCase();
            filtered = withDistance.filter((loc: any) => {
                const cats = (loc.profile?.service_categories ?? []) as string[];
                return cats.some((c: string) => c.toLowerCase().includes(catLower) || catLower.includes(c.toLowerCase()));
            });
        }

        const pros = filtered.map((loc: any) => ({
            location_id: loc.id,
            provider_id: loc.provider_id,
            id: loc.provider_id,
            nickname: loc.nickname,
            address: loc.address,
            latitude: loc.latitude,
            longitude: loc.longitude,
            distance_km: loc.distance_km,
            service_radius_km: loc.service_radius_km,
            short_description: loc.profile?.short_description ?? null,
            banner_url: loc.profile?.banner_url ?? null,
            service_categories: loc.profile?.service_categories ?? [],
            ai_review_summary: loc.profile?.ai_review_summary ?? null,
            positives: loc.profile?.positives ?? [],
            negatives: loc.profile?.negatives ?? [],
            metrics_punctuality: loc.profile?.metrics_punctuality ?? 0,
            metrics_tidiness: loc.profile?.metrics_tidiness ?? 0,
            metrics_professionalism: loc.profile?.metrics_professionalism ?? 0,
            metrics_cleanup: loc.profile?.metrics_cleanup ?? 0,
            total_jobs_completed: loc.profile?.total_jobs_completed ?? 0,
            google_place_id: loc.profile?.google_place_id ?? null,
        }));

        // Best-effort backend cleanup: remove invalid provider_profiles and their locations.
        if (invalidProviderIds.size > 0) {
            try {
                const admin = await createSupabaseAdminClient();
                const ids = Array.from(invalidProviderIds);
                await admin.from('provider_locations').delete().in('provider_id', ids);
                await admin.from('provider_profiles').delete().in('id', ids);
            } catch (e) {
                console.warn(
                    'Failed to delete providers with invalid/empty trades:',
                    (e as Error).message
                );
            }
        }

        return NextResponse.json({ pros });
    } catch (e) {
        console.error('Pros API error:', e);
        return NextResponse.json(
            { error: (e as Error).message, pros: [] },
            { status: 500 }
        );
    }
}
