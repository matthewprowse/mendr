/**
 * GET /api/providers/search?q=QUERY
 *
 * Text search for contractors/providers.
 *   1. Queries our `providers` table first (ilike match on name and address).
 *   2. If zero active results are found, falls back to Google Places Text
 *      Search so the user can discover providers not yet in our database.
 *
 * Auth required — returns 401 when unauthenticated.
 * Results capped at 10 per source.
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sanitizeOrIlikeTerm } from '@/lib/supabase/filters';
import { withAuth } from '@/lib/api/guards';

export type ProviderSearchResult = {
    id: string;
    googlePlaceId: string | null;
    name: string;
    address: string | null;
    rating: number | null;
    /** Where the result came from — lets the UI badge Google results. */
    source: 'database' | 'google';
};

function getGoogleApiKey(): string | undefined {
    return (
        process.env.GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    );
}

// Auth is enforced by the withAuth guard (finding M12); the handler only runs
// for a signed-in user.
export const GET = withAuth(async (req): Promise<NextResponse> => {
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
        return NextResponse.json({ results: [] });
    }

    // Escape ilike wildcards and strip or-filter metacharacters so the term
    // cannot break out of the string-built `.or(...)` filter (finding M7).
    const term = sanitizeOrIlikeTerm(q);
    if (term.length < 2) {
        return NextResponse.json({ results: [] });
    }

    const admin = await createSupabaseAdminClient();

    // --- 1. Search our providers table ---
    const { data: dbProviders } = await admin
        .from('providers')
        .select('id, google_place_id, name, address, rating')
        .or(`name.ilike.%${term}%,address.ilike.%${term}%`)
        .eq('is_active', true)
        .limit(10);

    if (dbProviders && dbProviders.length > 0) {
        const results: ProviderSearchResult[] = dbProviders.map((p) => ({
            id: p.id as string,
            googlePlaceId: (p.google_place_id as string | null) ?? null,
            name: (p.name as string | null) ?? 'Unknown',
            address: (p.address as string | null) ?? null,
            rating: (p.rating as number | null) ?? null,
            source: 'database',
        }));
        return NextResponse.json({ results });
    }

    // --- 2. Fall back to Google Places Text Search ---
    const apiKey = getGoogleApiKey();
    if (!apiKey) {
        return NextResponse.json({ results: [] });
    }

    try {
        const url = new URL(
            'https://maps.googleapis.com/maps/api/place/textsearch/json',
        );
        url.searchParams.set('query', q);
        url.searchParams.set('key', apiKey);

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`Places API error: ${res.status}`);

        const data = (await res.json()) as {
            results?: Array<{
                place_id: string;
                name: string;
                formatted_address?: string;
                rating?: number;
            }>;
        };

        const results: ProviderSearchResult[] = (data.results ?? [])
            .slice(0, 10)
            .map((p) => ({
                id: p.place_id,
                googlePlaceId: p.place_id,
                name: p.name,
                address: p.formatted_address ?? null,
                rating: p.rating ?? null,
                source: 'google',
            }));

        return NextResponse.json({ results });
    } catch {
        return NextResponse.json({ results: [] });
    }
});
