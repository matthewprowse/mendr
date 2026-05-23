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
