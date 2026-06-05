import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { braveWebSearch, BraveSearchError } from '@/lib/cost/brave-search';

const originalKey = process.env.BRAVE_SEARCH_API_KEY;
beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-brave-key';
});
afterEach(() => {
    if (originalKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = originalKey;
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

describe('braveWebSearch', () => {
    it('builds an encoded query URL with count and country, and sends the token header', async () => {
        const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
            jsonResponse({ web: { results: [] } }),
        );
        await braveWebSearch('geyser repair cost cape town', {
            count: 3,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toContain('q=geyser%20repair%20cost%20cape%20town');
        expect(url).toContain('count=3');
        expect(url).toContain('country=ZA');
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers['X-Subscription-Token']).toBe('test-brave-key');
        expect(headers['Accept']).toBe('application/json');
    });

    it('maps web results to title/url/description', async () => {
        const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
            jsonResponse({
                web: {
                    results: [
                        {
                            title: 'Geyser prices',
                            url: 'https://x.co',
                            description: 'R800 to R2500',
                        },
                        { title: 'Only title' },
                    ],
                },
            }),
        );
        const out = await braveWebSearch('q', {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(out).toEqual([
            { title: 'Geyser prices', url: 'https://x.co', description: 'R800 to R2500' },
            { title: 'Only title', url: '', description: '' },
        ]);
    });

    it('returns an empty array for a blank query without calling fetch', async () => {
        const fetchImpl = vi.fn();
        const out = await braveWebSearch('   ', {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(out).toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('clamps count into the 1..20 range', async () => {
        const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
            jsonResponse({ web: { results: [] } }),
        );
        await braveWebSearch('q', {
            count: 99,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(String(fetchImpl.mock.calls[0][0])).toContain('count=20');
    });

    it('throws when the API key is missing', async () => {
        delete process.env.BRAVE_SEARCH_API_KEY;
        await expect(
            braveWebSearch('q', { fetchImpl: vi.fn() as unknown as typeof fetch }),
        ).rejects.toBeInstanceOf(BraveSearchError);
    });

    it('throws on a non-2xx response', async () => {
        const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
            jsonResponse({ error: 'rate limited' }, 429),
        );
        await expect(
            braveWebSearch('q', { fetchImpl: fetchImpl as unknown as typeof fetch }),
        ).rejects.toBeInstanceOf(BraveSearchError);
    });
});
