/**
 * DataForSEO Business Data — Google Reviews (Standard task_post / task_get).
 *
 * Endpoints:
 *   POST /v3/business_data/google/reviews/task_post  — create a task (~$0.00075/task)
 *   GET  /v3/business_data/google/reviews/task_get/$id — retrieve results
 *
 * Auth:     HTTP Basic (DATAFORSEO_LOGIN : DATAFORSEO_PASSWORD)
 *
 * The standard method is used in preference to live/advanced as it is available
 * on all account tiers. Tasks are typically ready within 5–15 seconds; we poll
 * with a short backoff before returning.
 *
 * Required env vars:
 *   DATAFORSEO_LOGIN     — DataForSEO account login (email)
 *   DATAFORSEO_PASSWORD  — DataForSEO account password
 */

const TASK_POST_URL = 'https://api.dataforseo.com/v3/business_data/google/reviews/task_post';
const TASK_GET_BASE = 'https://api.dataforseo.com/v3/business_data/google/reviews/task_get';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REVIEWS_PER_REQUEST = 20;
/** How long to wait after task_post before first poll (ms). */
const POLL_INITIAL_DELAY_MS = 15_000;
/** Max additional polls after the first. */
const POLL_MAX_RETRIES = 3;
const POLL_RETRY_DELAY_MS = 8_000;

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

/** Parse a task result block into a DataForSEOResult. */
function parseTaskResult(task: Record<string, unknown>): DataForSEOResult | null {
    const taskResults = Array.isArray(task.result) ? task.result : [];
    const firstResult = taskResults[0] as Record<string, unknown> | null;
    if (!firstResult) {
        // Task completed but no results (new or uncrawled business)
        return { title: null, rating_count: null, reviews: [] };
    }

    const title = typeof firstResult.title === 'string' ? firstResult.title : null;
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
}

/**
 * Fetch reviews for a Google Place via DataForSEO (standard task_post → task_get).
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

    const authHeader = makeAuthHeader(creds.login, creds.password);

    // ── Step 1: Create task ──────────────────────────────────────────────────
    let taskId: string | null = null;
    try {
        const ctrl    = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

        const res = await fetch(TASK_POST_URL, {
            method:  'POST',
            signal:  ctrl.signal,
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify([{
                place_id:      placeId,
                location_code: locationCode,
                language_code: languageCode,
                depth:         MAX_REVIEWS_PER_REQUEST,
            }]),
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error(JSON.stringify({ type: 'dataforseo_post_http_error', status: res.status, place_id: placeId, detail: text.slice(0, 200) }));
            return null;
        }

        const json = await res.json().catch(() => null) as Record<string, unknown> | null;
        const tasks = Array.isArray(json?.tasks) ? json!.tasks as Record<string, unknown>[] : [];
        taskId = typeof tasks[0]?.id === 'string' ? tasks[0].id : null;

        if (!taskId) {
            console.error(JSON.stringify({ type: 'dataforseo_no_task_id', place_id: placeId, status: (json as Record<string, unknown>)?.status_code }));
            return null;
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ type: 'dataforseo_post_error', place_id: placeId, reason: msg }));
        return null;
    }

    // ── Step 2: Poll for results ─────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, POLL_INITIAL_DELAY_MS));

    for (let attempt = 0; attempt <= POLL_MAX_RETRIES; attempt++) {
        try {
            const ctrl    = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

            const res = await fetch(`${TASK_GET_BASE}/${taskId}`, {
                method:  'GET',
                signal:  ctrl.signal,
                headers: { 'Authorization': authHeader },
            });
            clearTimeout(timeout);

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.error(JSON.stringify({ type: 'dataforseo_get_http_error', status: res.status, task_id: taskId, detail: text.slice(0, 200) }));
                return null;
            }

            const json = await res.json().catch(() => null) as Record<string, unknown> | null;
            const tasks = Array.isArray(json?.tasks) ? json!.tasks as Record<string, unknown>[] : [];
            const task  = tasks[0] as Record<string, unknown> | null;
            if (!task) return null;

            const statusCode = task.status_code as number | undefined;

            // 20000 = complete
            if (statusCode === 20000) {
                return parseTaskResult(task);
            }

            // 20100 = task created/pending, 40602 = task in queue — both mean not ready yet
            if ((statusCode === 20100 || statusCode === 40602) && attempt < POLL_MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, POLL_RETRY_DELAY_MS));
                continue;
            }

            // Any other status or exhausted retries
            console.warn(JSON.stringify({ type: 'dataforseo_task_not_ready', task_id: taskId, status_code: statusCode, attempt }));
            return null;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isAbort = msg.includes('abort') || msg.includes('AbortError');
            console.error(JSON.stringify({ type: 'dataforseo_get_error', task_id: taskId, timeout: isAbort, reason: msg }));
            return null;
        }
    }

    return null;
}
