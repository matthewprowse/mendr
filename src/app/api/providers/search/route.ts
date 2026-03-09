import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

const CAPE_TOWN = { lat: -33.9249, lng: 18.4241 };
const CACHE_TTL_DAYS = 7;

function buildQueryKey(query: string, lat: number | null, lng: number | null): string {
    const q = String(query).toLowerCase().trim();
    const latR = lat != null ? Math.round(Number(lat) * 1000) / 1000 : CAPE_TOWN.lat;
    const lngR = lng != null ? Math.round(Number(lng) * 1000) / 1000 : CAPE_TOWN.lng;
    return `search_${latR}_${lngR}_${q}`;
}

export async function POST(req: NextRequest) {
    try {
        const { query, lat, lng } = await req.json();

        if (!query || typeof query !== 'string' || !query.trim()) {
            return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google Places API key is not configured' },
                { status: 500 }
            );
        }

        const center = lat != null && lng != null ? { lat, lng } : CAPE_TOWN;
        const queryKey = buildQueryKey(query, center.lat, center.lng);

        // Check cache first (valid for 7 days)
        const supabase = await createSupabaseServerClient();
        const cacheCutoff = new Date();
        cacheCutoff.setDate(cacheCutoff.getDate() - CACHE_TTL_DAYS);

        const { data: cacheRow } = await supabase
            .from('provider_search_cache')
            .select('providers, created_at')
            .eq('query_key', queryKey)
            .single();

        if (
            cacheRow?.providers &&
            Array.isArray(cacheRow.providers) &&
            cacheRow.providers.length > 0
        ) {
            const createdAt = cacheRow.created_at ? new Date(cacheRow.created_at).getTime() : 0;
            if (Date.now() - createdAt < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
                return NextResponse.json({ providers: cacheRow.providers });
            }
        }

        // Cache miss: call Google Places API
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
            return NextResponse.json({ error: 'Failed to search providers' }, { status: 500 });
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

        // Persist to cache for future identical searches
        if (providers.length > 0) {
            const placeIds = providers.map((p: { place_id: string }) => p.place_id);
            createSupabaseAdminClient()
                .then((adminSupabase) =>
                    adminSupabase.from('provider_search_cache').upsert(
                        {
                            query_key: queryKey,
                            place_ids: placeIds,
                            routing_summaries: [],
                            providers,
                            next_page_token: null,
                            created_at: new Date().toISOString(),
                        },
                        { onConflict: 'query_key' }
                    )
                )
                .catch((e) =>
                    console.warn('Provider search cache write skipped:', (e as Error).message)
                );
        }

        return NextResponse.json({ providers });
    } catch (error: any) {
        console.error('Provider search error:', error);
        return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
    }
}
