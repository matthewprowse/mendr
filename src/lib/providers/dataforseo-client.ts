/**
 * DataForSEO Business Data — Google Reviews (Live).
 *
 * Endpoint: POST /v3/business_data/google/reviews/live/advanced
 * Auth:     HTTP Basic (DATAFORSEO_LOGIN : DATAFORSEO_PASSWORD)
 * Cost:     ~$0.005 per task (1 task = reviews for one place)
 *
 * Returns up to 20 reviews per request. For providers with more reviews,
 * paginate with depth + offset — but given our providers average 3–6 reviews,
 * a single request covers all of them.
 *
 * Required env vars:
 *   DATAFORSEO_LOGIN     — DataForSEO account login (email)
 *   DATAFORSEO_PASSWORD  — DataForSEO account password
 */

const BASE_URL = 'https://api.dataforseo.com/v3/business_data/google/reviews/live/advanced';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REVIEWS_PER_REQUEST = 20;

export interface DataForSEOReview {
    /** Stable URL for this review — used as source_ref for deduplication. */
    review_url: string | null;
    rating: number | null;
    /** Review text (may be null for rating-only reviews). */
    review_text: string | null;
    reviewer_name: string | null;
    /** ISO date string or null. */
    timestamp: string | null;
}

export interface DataForSEOResult {
    /** Place name as returned by DataForSEO. */
    title: string | null;
    /** Total review count reported by Google (may exceed our stored count). */
    rating_count: number | null;
    reviews: DataForSEOReview[];
}

function getCredentials(): { login: string; password: string } | null {
    const login    = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) return null;
    return { login, password };
}

function makeAuthHeader(login: string, password: string): string {
    const encoded = Buffer.from(`${login}:${password}`).toString('base64');
    return `Basic ${encoded}`;
}

function extractReview(raw: Record<string, unknown>): DataForSEOReview | null {
    const reviewText = typeof raw.review_text === 'string' ? raw.review_text.trim() : null;
    // Discard rating-only reviews — no text to summarise
    if (!reviewText) return null;

    const rating =
        typeof raw.rating === 'number' && raw.rating >= 1 && raw.rating <= 5
            ? raw.rating
            : null;

    const reviewUrl = typeof raw.review_url === 'string' ? raw.review_url.trim() : null;

    const reviewerName =
        (typeof (raw.profile_name ?? raw.author_title) === 'string'
            ? String(raw.profile_name ?? raw.author_title).trim()
            : null) || null;

    const timestamp =
        typeof raw.timestamp === 'string' && raw.timestamp
            ? raw.timestamp
            : null;

    return { review_url: reviewUrl, rating, review_text: reviewText, reviewer_name: reviewerName, timestamp };
}

/**
 * Fetch reviews for a Google Place via DataForSEO.
 *
 * @param googlePlaceId  The raw Place ID (e.g. "ChIJ...") or resource name ("places/ChIJ...")
 * @param locationCode   DataForSEO location code. South Africa = 2710 (default).
 * @param languageCode   ISO 639-1 code. Default "en".
 */
export async function fetchDataForSEOReviews(
    googlePlaceId: string,
    locationCode = 2710,
    languageCode = 'en',
): Promise<DataForSEOResult | null> {
    const creds = getCredentials();
    if (!creds) {
        console.warn(JSON.stringify({ type: 'dataforseo_missing_credentials' }));
        return null;
    }

    // Strip "places/" prefix if present — DataForSEO accepts the raw Place ID
    const placeId = googlePlaceId.startsWith('places/')
        ? googlePlaceId.slice('places/'.length)
        : googlePlaceId;

    if (!placeId) return null;

    const body = JSON.stringify([
        {
            place_id:      placeId,
            location_code: locationCode,
            language_code: languageCode,
            depth:         MAX_REVIEWS_PER_REQUEST,
            sort_by:       'most_relevant',
        },
    ]);

    try {
        const ctrl    = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

        const res = await fetch(BASE_URL, {
            method:  'POST',
            signal:  ctrl.signal,
            headers: {
                'Content-Type':  'application/json',
                'Authorization': makeAuthHeader(creds.login, creds.password),
            },
            body,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error(JSON.stringify({
                type:       'dataforseo_http_error',
                status:     res.status,
                place_id:   placeId,
                detail:     text.slice(0, 200),
            }));
            return null;
        }

        const json = await res.json().catch(() => null) as Record<string, unknown> | null;
        if (!json) return null;

        // DataForSEO wraps results in tasks[0].result[0]
        const tasks  = Array.isArray(json.tasks) ? json.tasks : [];
        const task   = tasks[0] as Record<string, unknown> | null;
        if (!task) return null;

        const taskResults = Array.isArray(task.result) ? task.result : [];
        const firstResult = taskResults[0] as Record<string, unknown> | null;
        if (!firstResult) {
            // Graceful: task returned but no reviews (new or uncrawled business)
            return { title: null, rating_count: null, reviews: [] };
        }

        const title       = typeof firstResult.title === 'string' ? firstResult.title : null;
        const ratingCount =
            typeof firstResult.rating === 'object' && firstResult.rating !== null
                ? (typeof (firstResult.rating as Record<string, unknown>).votes_count === 'number'
                    ? (firstResult.rating as Record<string, unknown>).votes_count as number
                    : null)
                : null;

        const rawItems = Array.isArray(firstResult.items) ? firstResult.items : [];
        const reviews: DataForSEOReview[] = [];
        for (const item of rawItems) {
            const r = extractReview(item as Record<string, unknown>);
            if (r) reviews.push(r);
        }

        return { title, rating_count: ratingCount, reviews };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isAbort = msg.includes('abort') || msg.includes('AbortError');
        console.error(JSON.stringify({
            type:     'dataforseo_fetch_error',
            place_id: placeId,
            timeout:  isAbort,
            reason:   msg,
        }));
        return null;
    }
}
