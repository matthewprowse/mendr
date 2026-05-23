/**
 * Google Places (New) Text Search HTTP client extracted from `handler.ts` in
 * Phase 2.
 *
 * Encapsulates the field mask, retry-on-503, and transient-error detection so
 * the route handler doesn't carry HTTP plumbing. Pure-ish — takes the fetch
 * implementation as an optional parameter for testability.
 */

export const PLACES_SEARCH_TEXT_URL =
    'https://places.googleapis.com/v1/places:searchText';

export const PLACES_SEARCH_TEXT_FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.location,places.types,places.reviews,places.editorialSummary,places.reviewSummary,places.regularOpeningHours,places.currentOpeningHours,routingSummaries,nextPageToken';

export function isTransientPlacesHttpStatus(status: number): boolean {
    return status === 503 || status === 502 || status === 429;
}

export type PlacesFetchImpl = typeof fetch;

/**
 * POST to Places searchText with one automatic retry on 503 (transient Google
 * outages). All other statuses pass through unchanged.
 */
export async function fetchPlacesSearchText(
    apiKey: string,
    bodyObj: Record<string, unknown>,
    fetchImpl: PlacesFetchImpl = fetch,
): Promise<Response> {
    // Mock branch — used by Playwright E2E to avoid real Google Places calls.
    // Returns a deterministic set of three plumbers in Cape Town, schema-aligned
    // with the Places New `searchText` field mask above.
    if (process.env.MOCK_PLACES === '1') {
        const payload = buildMockPlacesSearchTextResponse();
        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const init: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': PLACES_SEARCH_TEXT_FIELD_MASK,
        },
        body: JSON.stringify(bodyObj),
    };
    let res = await fetchImpl(PLACES_SEARCH_TEXT_URL, init);
    if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 400));
        res = await fetchImpl(PLACES_SEARCH_TEXT_URL, init);
    }
    return res;
}

/**
 * Build a deterministic Places searchText response for mock/E2E mode. Exported
 * so the mock branch above and unit tests share one source of truth.
 *
 * The shape mirrors the Places New API (`places: [...]`) and provides three
 * hand-crafted plumbers in Cape Town — each with a stable place_id, displayName,
 * formattedAddress, rating, userRatingCount, and location.
 */
export function buildMockPlacesSearchTextResponse(): Record<string, unknown> {
    return {
        places: [
            {
                id: 'mock_plumber_capetown_001',
                displayName: { text: 'CapeFix Plumbing', languageCode: 'en' },
                formattedAddress: '12 Bree Street, Cape Town, 8001, South Africa',
                rating: 4.7,
                userRatingCount: 184,
                nationalPhoneNumber: '021 555 0101',
                websiteUri: 'https://example.com/capefix-plumbing',
                location: { latitude: -33.9213, longitude: 18.4189 },
                types: ['plumber', 'point_of_interest'],
            },
            {
                id: 'mock_plumber_capetown_002',
                displayName: { text: 'Table Mountain Plumbers', languageCode: 'en' },
                formattedAddress: '45 Long Street, Cape Town, 8001, South Africa',
                rating: 4.4,
                userRatingCount: 96,
                nationalPhoneNumber: '021 555 0202',
                websiteUri: 'https://example.com/table-mountain-plumbers',
                location: { latitude: -33.9249, longitude: 18.4241 },
                types: ['plumber', 'point_of_interest'],
            },
            {
                id: 'mock_plumber_capetown_003',
                displayName: { text: 'Atlantic Geyser Repairs', languageCode: 'en' },
                formattedAddress: '8 Main Road, Sea Point, Cape Town, 8005, South Africa',
                rating: 4.9,
                userRatingCount: 312,
                nationalPhoneNumber: '021 555 0303',
                websiteUri: 'https://example.com/atlantic-geyser',
                location: { latitude: -33.9151, longitude: 18.3845 },
                types: ['plumber', 'point_of_interest'],
            },
        ],
    };
}

/**
 * Resolve the API key from environment, preferring the server-only variable.
 * Returns `null` when neither is configured (caller is responsible for the
 * 500 response).
 */
export function resolvePlacesApiKey(): {
    apiKey: string | null;
    source: string;
} {
    const apiKey =
        process.env.GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const source = process.env.GOOGLE_PLACES_API_KEY
        ? 'GOOGLE_PLACES_API_KEY'
        : process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
          ? 'NEXT_PUBLIC_GOOGLE_PLACES_API_KEY'
          : process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'
            : 'none';
    return { apiKey: apiKey ?? null, source };
}
