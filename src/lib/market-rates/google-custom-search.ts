import type { MarketRatesIntent, MarketRateSource } from './types';
import { trimSecretEnv } from './secret-env';

type CseItem = { link?: string; title?: string; snippet?: string };

export type GoogleCseCallResult = {
    sources: MarketRateSource[];
    /** 0 when key/cx missing (no HTTP request). */
    httpStatus: number;
    /** Google JSON API `error.message`, or a short internal reason. */
    errorMessage?: string;
};

export type GoogleCseSearchOptions = {
    /**
     * `active` can suppress some DIY/forum price pages. Default `off` improves recall for cost research.
     */
    safe?: 'active' | 'off';
    /** When false, omit `gl` (less geo filtering on the index). */
    geoBiasZa?: boolean;
};

export async function runGoogleCustomSearch(
    query: string,
    intent: MarketRatesIntent,
    opts?: GoogleCseSearchOptions
): Promise<GoogleCseCallResult> {
    const key = trimSecretEnv(process.env.GOOGLE_CUSTOM_SEARCH_API_KEY);
    const cx = trimSecretEnv(process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID);
    if (!key || !cx) {
        return {
            sources: [],
            httpStatus: 0,
            errorMessage: 'missing_api_key_or_engine_id',
        };
    }

    const safe = opts?.safe ?? 'off';
    const useGl = opts?.geoBiasZa !== false;

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', key);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '10');
    url.searchParams.set('hl', 'en');
    if (useGl) {
        url.searchParams.set('gl', 'za');
    }
    url.searchParams.set('safe', safe);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
            const errJson = (await res.json()) as { error?: { message?: string } };
            if (typeof errJson?.error?.message === 'string' && errJson.error.message.trim()) {
                errorMessage = errJson.error.message.trim();
            }
        } catch {
            errorMessage = `${errorMessage} ${res.statusText}`.trim();
        }
        return { sources: [], httpStatus: res.status, errorMessage };
    }

    let data: { items?: CseItem[] };
    try {
        data = (await res.json()) as { items?: CseItem[] };
    } catch {
        return { sources: [], httpStatus: res.status, errorMessage: 'invalid_json_response' };
    }

    const items = Array.isArray(data.items) ? data.items : [];
    const now = new Date().toISOString();
    const out: MarketRateSource[] = [];

    for (const it of items) {
        const link = typeof it.link === 'string' ? it.link.trim() : '';
        if (!link || !/^https?:\/\//i.test(link)) continue;
        out.push({
            url: link,
            title: typeof it.title === 'string' ? it.title.trim() : link,
            snippet: typeof it.snippet === 'string' ? it.snippet.trim() : '',
            intent,
            fetched_at: now,
        });
    }

    return { sources: out, httpStatus: 200 };
}
