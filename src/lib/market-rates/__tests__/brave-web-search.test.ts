import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock global fetch before importing the module under test
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
    vi.clearAllMocks();
    delete process.env.BRAVE_SEARCH_API_KEY;
});

async function importModule() {
    // Re-import fresh each time so env changes take effect
    return await import('../brave-web-search?t=' + Date.now());
}

describe('runBraveWebSearch', () => {
    it('returns empty sources when API key is missing', async () => {
        const { runBraveWebSearch } = await importModule();
        const result = await runBraveWebSearch('boiler repair cost', 'retail');
        expect(result.httpStatus).toBe(0);
        expect(result.errorMessage).toBe('missing_brave_search_api_key');
        expect(result.sources).toHaveLength(0);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns empty sources for empty query', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        const { runBraveWebSearch } = await importModule();
        const result = await runBraveWebSearch('   ', 'retail');
        expect(result.errorMessage).toBe('empty_query');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns mapped sources on a successful response', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                web: {
                    results: [
                        { url: 'https://example.co.za/prices', title: 'Boiler Prices ZA', description: 'R800–R2000' },
                        { url: 'https://another.co.za', title: 'Another', description: 'R1000' },
                    ],
                },
            }),
        });
        const { runBraveWebSearch } = await importModule();
        const result = await runBraveWebSearch('boiler repair ZA', 'retail');
        expect(result.httpStatus).toBe(200);
        expect(result.sources).toHaveLength(2);
        expect(result.sources[0].url).toBe('https://example.co.za/prices');
        expect(result.sources[0].snippet).toBe('R800–R2000');
    });

    it('includes AbortSignal.timeout in the fetch options', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ web: { results: [] } }),
        });
        const { runBraveWebSearch } = await importModule();
        await runBraveWebSearch('test query', 'retail');
        const callOptions = mockFetch.mock.calls[0]?.[1] as RequestInit;
        expect(callOptions.signal).toBeDefined();
    });

    it('returns timeout error when fetch throws a TimeoutError', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        const timeoutError = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
        mockFetch.mockRejectedValueOnce(timeoutError);
        const { runBraveWebSearch } = await importModule();
        const result = await runBraveWebSearch('boiler repair', 'retail');
        expect(result.httpStatus).toBe(0);
        expect(result.errorMessage).toBe('brave_search_timeout');
    });

    it('returns fetch error for non-timeout errors', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch.mockRejectedValueOnce(new Error('Network failure'));
        const { runBraveWebSearch } = await importModule();
        const result = await runBraveWebSearch('boiler repair', 'retail');
        expect(result.errorMessage).toBe('brave_search_fetch_error');
    });

    it('handles non-ok HTTP response gracefully', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            json: async () => ({ message: 'rate limited' }),
        });
        const { runBraveWebSearch } = await importModule();
        const result = await runBraveWebSearch('query', 'retail');
        expect(result.httpStatus).toBe(429);
        expect(result.sources).toHaveLength(0);
    });

    it('filters out results with non-http URLs', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                web: {
                    results: [
                        { url: 'ftp://bad.example.com', title: 'Bad', description: '' },
                        { url: 'https://good.co.za', title: 'Good', description: 'price' },
                    ],
                },
            }),
        });
        const { runBraveWebSearch } = await importModule();
        const result = await runBraveWebSearch('query', 'retail');
        expect(result.sources).toHaveLength(1);
        expect(result.sources[0].url).toBe('https://good.co.za');
    });
});
