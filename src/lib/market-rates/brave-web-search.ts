import type { MarketRatesIntent, MarketRateSource } from './types';
import { trimSecretEnv } from './secret-env';

export type BraveWebSearchResult = {
    sources: MarketRateSource[];
    /** 0 when API key missing (no HTTP request). */
    httpStatus: number;
    errorMessage?: string;
};

type BraveWebResult = { url?: string; title?: string; description?: string };

/**
 * Brave Search API — optional fallback when Google Programmable Search is site-restricted
 * (no whole-web results). See https://brave.com/search/api/
 */
export async function runBraveWebSearch(
    query: string,
    intent: MarketRatesIntent
): Promise<BraveWebSearchResult> {
    const key = trimSecretEnv(process.env.BRAVE_SEARCH_API_KEY);
    if (!key) {
        return { sources: [], httpStatus: 0, errorMessage: 'missing_brave_search_api_key' };
    }

    const q = query.trim();
    if (!q) {
        return { sources: [], httpStatus: 0, errorMessage: 'empty_query' };
    }

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', q);
    url.searchParams.set('count', '10');

    let res: Response;
    try {
        res = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
                'X-Subscription-Token': key,
            },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(8_000),
        });
    } catch (err) {
        const isTimeout = err instanceof Error && err.name === 'TimeoutError';
        return {
            sources: [],
            httpStatus: 0,
            errorMessage: isTimeout ? 'brave_search_timeout' : 'brave_search_fetch_error',
        };
    }

    if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
            const errJson = (await res.json()) as { message?: string; error?: { message?: string } };
            const msg =
                (typeof errJson?.message === 'string' && errJson.message.trim()) ||
                (typeof errJson?.error?.message === 'string' && errJson.error.message.trim());
            if (msg) errorMessage = msg;
        } catch {
            errorMessage = `${errorMessage} ${res.statusText}`.trim();
        }
        return { sources: [], httpStatus: res.status, errorMessage };
    }

    let data: { web?: { results?: BraveWebResult[] } };
    try {
        data = (await res.json()) as { web?: { results?: BraveWebResult[] } };
    } catch {
        return { sources: [], httpStatus: res.status, errorMessage: 'invalid_json_response' };
    }

    const rawResults = data.web?.results;
    const items = Array.isArray(rawResults) ? rawResults : [];
    const now = new Date().toISOString();
    const out: MarketRateSource[] = [];

    for (const it of items) {
        const link = typeof it.url === 'string' ? it.url.trim() : '';
        if (!link || !/^https?:\/\//i.test(link)) continue;
        out.push({
            url: link,
            title: typeof it.title === 'string' && it.title.trim() ? it.title.trim() : link,
            snippet: typeof it.description === 'string' ? it.description.trim() : '',
            intent,
            fetched_at: now,
        });
    }

    return { sources: out, httpStatus: 200 };
}
