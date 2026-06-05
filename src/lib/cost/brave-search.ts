/**
 * Thin Brave Web Search client, used for market-rate (cost) research.
 *
 * IMPORTANT: this hits a paid API. It must only ever be called from the
 * deliberate, cached research pipeline (admin / cron), never from a page view
 * or a per-request read. The read path serves from the cost_estimates cache.
 */

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export type BraveResult = {
    title: string;
    url: string;
    description: string;
};

export class BraveSearchError extends Error {}

/**
 * Run a Brave web search and return the web results (title, url, description).
 * `fetchImpl` is injectable so the pipeline and tests can supply their own.
 * Throws BraveSearchError when the key is missing or the API responds non-2xx.
 */
export async function braveWebSearch(
    query: string,
    opts: { count?: number; country?: string; fetchImpl?: typeof fetch } = {},
): Promise<BraveResult[]> {
    const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
    if (!key) {
        throw new BraveSearchError('BRAVE_SEARCH_API_KEY is not configured.');
    }
    const q = query.trim();
    if (!q) return [];

    const count = Math.min(Math.max(Math.trunc(opts.count ?? 5), 1), 20);
    const country = opts.country ?? 'ZA';
    const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(q)}&count=${count}&country=${encodeURIComponent(country)}`;

    const doFetch = opts.fetchImpl ?? fetch;
    const res = await doFetch(url, {
        headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': key,
        },
    });

    if (!res.ok) {
        throw new BraveSearchError(`Brave search failed with status ${res.status}.`);
    }

    const json = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const results = json.web?.results ?? [];
    return results.map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        description: r.description ?? '',
    }));
}
