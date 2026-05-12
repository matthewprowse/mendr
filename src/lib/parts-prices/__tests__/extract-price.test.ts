import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────
// Must be declared before the first import of the module under test.

const mockGenerateContent = vi.fn();

vi.mock('@/lib/ai-client', () => ({
    getGeminiModel: () => ({
        generateContent: mockGenerateContent,
    }),
}));

// coerce-rand is a pure helper — let it run for real.

import { extractPartPrice } from '../extract-price';
import type { MarketRateSource } from '@/lib/market-rates/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSources(snippets: string[]): MarketRateSource[] {
    return snippets.map((s, i) => ({
        url: `https://example.co.za/${i}`,
        title: `Source ${i}`,
        snippet: s,
    }));
}

const EMPTY_PRICE = { price_min: null, price_max: null, price_display: null };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractPartPrice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── Early-exit guards ─────────────────────────────────────────────────────

    it('returns EMPTY immediately when sources array is empty', async () => {
        const result = await extractPartPrice('Heating element', 'Appliance Repair', '', []);
        expect(result).toEqual(EMPTY_PRICE);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('returns EMPTY when sources have blank snippets (title fallback yields no price)', async () => {
        // buildSnippetBlock falls back to source.title when snippet is blank,
        // so Gemini is still called — but if it returns null prices we get EMPTY.
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '{"price_min": null, "price_max": null, "price_display": null}' },
        });
        const sources = makeSources(['', '   ']);
        const result = await extractPartPrice('Heating element', 'Appliance Repair', '', sources);
        expect(result).toEqual(EMPTY_PRICE);
    });

    // ── Successful extraction ─────────────────────────────────────────────────

    it('parses price_min / price_max / price_display from Gemini response', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '{"price_min": 150, "price_max": 350, "price_display": "R150–R350"}' },
        });

        const sources = makeSources(['Water heater element R150–R350 South Africa']);
        const result = await extractPartPrice('Heating element', 'Plumbing', 'Geyser', sources);

        expect(result.price_min).toBe(150);
        expect(result.price_max).toBe(350);
        expect(result.price_display).toBe('R150–R350');
    });

    it('accepts camelCase keys from Gemini (priceMin / priceMax / priceDisplay)', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '{"priceMin": 500, "priceMax": 900, "priceDisplay": "R500–R900"}' },
        });

        const sources = makeSources(['R500–R900 pump repair']);
        const result = await extractPartPrice('Pump', 'Plumbing', '', sources);

        expect(result.price_min).toBe(500);
        expect(result.price_max).toBe(900);
        expect(result.price_display).toBe('R500–R900');
    });

    it('returns EMPTY when Gemini response contains no JSON object', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => 'Sorry, I cannot determine the price.' },
        });

        const sources = makeSources(['some snippet']);
        const result = await extractPartPrice('Heating element', 'Plumbing', '', sources);
        expect(result).toEqual(EMPTY_PRICE);
    });

    it('returns EMPTY when all JSON fields are null', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '{"price_min": null, "price_max": null, "price_display": null}' },
        });

        const sources = makeSources(['unrelated snippet']);
        const result = await extractPartPrice('Exotic part', 'Unknown', '', sources);
        expect(result).toEqual(EMPTY_PRICE);
    });

    // ── Error handling ────────────────────────────────────────────────────────

    it('returns EMPTY when Gemini throws a generic error', async () => {
        mockGenerateContent.mockRejectedValueOnce(new Error('API unavailable'));

        const sources = makeSources(['R200 part']);
        const result = await extractPartPrice('Part', 'Trade', '', sources);
        expect(result).toEqual(EMPTY_PRICE);
    });

    it('returns EMPTY on timeout and does not throw', async () => {
        vi.useFakeTimers();

        // generateContent never resolves — simulates a hung Gemini call
        mockGenerateContent.mockReturnValueOnce(new Promise(() => { /* never resolves */ }));

        const sources = makeSources(['R400 heating element ZA']);
        const resultPromise = extractPartPrice('Heating element', 'Plumbing', '', sources);

        // Advance past the 15s timeout
        await vi.advanceTimersByTimeAsync(16_000);

        const result = await resultPromise;
        expect(result).toEqual(EMPTY_PRICE);
    });

    // ── Snippet slicing ───────────────────────────────────────────────────────

    it('passes at most 6 snippets to Gemini regardless of source count', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '{"price_min": 100, "price_max": 200, "price_display": "R100–R200"}' },
        });

        const sources = makeSources(Array.from({ length: 10 }, (_, i) => `snippet ${i}`));
        await extractPartPrice('Part', 'Trade', '', sources);

        const callArg = mockGenerateContent.mock.calls[0][0];
        const promptText = callArg.contents[0].parts[0].text as string;
        // Only 6 numbered snippet lines should appear
        const snippetLines = (promptText.match(/^\[\d+\]/gm) ?? []).length;
        expect(snippetLines).toBeLessThanOrEqual(6);
    });
});
