/**
 * Uses Gemini to extract a ZAR price range for a single part from web snippets.
 */

import { getGeminiModel } from '@/lib/ai-client';
import type { MarketRateSource } from '@/lib/market-rates/types';
import { coerceWholeRand } from './coerce-rand';

export interface ExtractedPrice {
    price_min: number | null;
    price_max: number | null;
    price_display: string | null;
}

function tryParsePrice(text: string): ExtractedPrice | null {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as Record<string, unknown>;
        const minRaw = o.price_min ?? o.priceMin ?? o.min_price ?? o.minPrice;
        const maxRaw = o.price_max ?? o.priceMax ?? o.max_price ?? o.maxPrice;
        const displayRaw =
            o.price_display ?? o.priceDisplay ?? o.display_price ?? o.displayPrice;
        const min = coerceWholeRand(minRaw);
        const max = coerceWholeRand(maxRaw);
        const display = typeof displayRaw === 'string' && displayRaw.trim()
            ? displayRaw.trim()
            : null;
        return { price_min: min, price_max: max, price_display: display };
    } catch {
        return null;
    }
}

function buildSnippetBlock(sources: MarketRateSource[]): string {
    return sources
        .slice(0, 6)
        .map((s, i) => `[${i + 1}] ${s.snippet || s.title}`.slice(0, 220))
        .join('\n');
}

export async function extractPartPrice(
    partName: string,
    trade: string,
    tradeDetail: string,
    sources: MarketRateSource[],
): Promise<ExtractedPrice> {
    const EMPTY: ExtractedPrice = { price_min: null, price_max: null, price_display: null };

    if (sources.length === 0) return EMPTY;

    const snippetBlock = buildSnippetBlock(sources);
    if (!snippetBlock.trim()) return EMPTY;

    const prompt = `You extract retail or installed prices for individual home-maintenance parts in South Africa (Western Cape focus, ZAR).

PART: "${partName}"
TRADE CONTEXT: "${trade}${tradeDetail ? ` — ${tradeDetail}` : ''}"

WEB SNIPPETS (weak evidence — South African pricing only):
${snippetBlock}

TASK:
Return ONE raw JSON object. Extract the likely retail or installed price for this specific part/line item in South Africa.
- price_min and price_max: whole rand amounts (no cents, no R prefix). Use null if genuinely unknown.
- price_display: human-friendly string like "R150–R350" or "R800" (single point). Use null if unknown.
- If the snippets contain no relevant South African pricing, return null for all three fields.
- Do not invent or estimate prices not supported by the snippets.
- For call-out fees, return the typical trade call-out for that region.
- For labour lines, return the hourly or per-job rate.

JSON shape (exactly these three keys, no others):
{"price_min": 150, "price_max": 350, "price_display": "R150–R350"}`;

    try {
        const model = getGeminiModel();
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 256,
            },
        });
        const text = result.response.text();
        return tryParsePrice(text || '') ?? EMPTY;
    } catch (err) {
        console.error('[extract-price] Gemini extraction failed:', err);
        return EMPTY;
    }
}
