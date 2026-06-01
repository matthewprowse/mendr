/**
 * Unit tests for ai-cost-logger.
 *
 * Covers:
 *   - estimateUsdWithTable maths (input/output/cached split, fallback rate,
 *     prefix matching of revision suffixes).
 *   - loadPricingFromDb shape conversion (per-1M USD → per-token USD).
 *   - logGeminiUsage end-to-end against a mocked Supabase admin client.
 *   - Cache invalidation + fallback path when the DB is unreachable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocked Supabase admin client (mutable per test) ──────────────────────────

interface PricingRow {
    model_name: string;
    input_per_1m_usd: number;
    output_per_1m_usd: number;
    cached_input_per_1m_usd: number | null;
}

let pricingRows: PricingRow[] = [];
let pricingError: { message: string } | null = null;
let insertedCostEvents: Array<Record<string, unknown>> = [];
let insertError: { message: string } | null = null;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: (table: string) => {
            if (table === 'ai_model_pricing') {
                return {
                    select: () => ({
                        is: async () => ({ data: pricingRows, error: pricingError }),
                    }),
                };
            }
            if (table === 'ai_cost_events') {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        if (insertError) return { error: insertError };
                        insertedCostEvents.push(row);
                        return { error: null };
                    },
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        },
    })),
}));

beforeEach(async () => {
    pricingRows = [
        { model_name: 'gemini-2.5-flash',      input_per_1m_usd: 0.30, output_per_1m_usd: 1.00, cached_input_per_1m_usd: null },
        { model_name: 'gemini-3.5-flash',      input_per_1m_usd: 1.50, output_per_1m_usd: 9.00, cached_input_per_1m_usd: 0.15 },
        { model_name: 'gemini-2.0-flash-lite', input_per_1m_usd: 0.075, output_per_1m_usd: 0.30, cached_input_per_1m_usd: null },
    ];
    pricingError = null;
    insertedCostEvents = [];
    insertError = null;
    // Always invalidate the in-memory cache between tests so the new
    // pricingRows / pricingError state is observed.
    const mod = await import('@/lib/ai/ai-cost-logger');
    mod.invalidatePricingCache();
    vi.clearAllMocks();
});

describe('estimateUsdWithTable', () => {
    it('charges input + output at the model rate', async () => {
        const { estimateUsdWithTable, FALLBACK_PRICING } = await import('@/lib/ai/ai-cost-logger');
        const cost = estimateUsdWithTable(FALLBACK_PRICING, 'gemini-2.5-flash', 1_000_000, 500_000, 0);
        // 1M input * 0.30/1M + 500k output * 1.00/1M = 0.30 + 0.50 = 0.80
        expect(cost).toBeCloseTo(0.8, 6);
    });

    it('splits prompt tokens between cached and regular rates when supported', async () => {
        const { estimateUsdWithTable, FALLBACK_PRICING } = await import('@/lib/ai/ai-cost-logger');
        // 3.5 Flash: input 1.50, output 9.00, cached 0.15 (all per 1M).
        // 200k prompt total, 50k cached → 150k regular input.
        const cost = estimateUsdWithTable(FALLBACK_PRICING, 'gemini-3.5-flash', 200_000, 100_000, 50_000);
        // 150k * 1.50/1M + 50k * 0.15/1M + 100k * 9.00/1M
        // = 0.225 + 0.0075 + 0.9 = 1.1325
        expect(cost).toBeCloseTo(1.1325, 6);
    });

    it('ignores cached tokens when the model has no caching tier', async () => {
        const { estimateUsdWithTable, FALLBACK_PRICING } = await import('@/lib/ai/ai-cost-logger');
        // 2.5 Flash has no cachedInput rate — cachedTokens parameter must
        // not reduce the bill.
        const cost = estimateUsdWithTable(FALLBACK_PRICING, 'gemini-2.5-flash', 100_000, 0, 50_000);
        expect(cost).toBeCloseTo(100_000 * (0.30 / 1_000_000), 9);
    });

    it('prefix-matches revision suffixes like -001 or -exp-0205', async () => {
        const { estimateUsdWithTable, FALLBACK_PRICING } = await import('@/lib/ai/ai-cost-logger');
        const cost = estimateUsdWithTable(FALLBACK_PRICING, 'gemini-2.5-flash-001', 1_000_000, 0, 0);
        expect(cost).toBeCloseTo(0.30, 6);
    });

    it('falls back to default rate for unknown model names', async () => {
        const { estimateUsdWithTable } = await import('@/lib/ai/ai-cost-logger');
        const cost = estimateUsdWithTable({}, 'gemini-unknown-future', 1_000_000, 1_000_000, 0);
        // Default rate is 2.5-flash equivalents: 0.30 input + 1.00 output = 1.30
        expect(cost).toBeCloseTo(1.30, 6);
    });
});

describe('loadPricingFromDb', () => {
    it('converts per-1M USD rates into per-token rates', async () => {
        const { loadPricingFromDb } = await import('@/lib/ai/ai-cost-logger');
        const table = await loadPricingFromDb();
        expect(table['gemini-2.5-flash'].input).toBeCloseTo(0.30 / 1_000_000, 12);
        expect(table['gemini-2.5-flash'].output).toBeCloseTo(1.00 / 1_000_000, 12);
        expect(table['gemini-2.5-flash'].cachedInput).toBeUndefined();
        expect(table['gemini-3.5-flash'].cachedInput).toBeCloseTo(0.15 / 1_000_000, 12);
    });

    it('throws when the table query errors', async () => {
        pricingError = { message: 'connection refused' };
        const { loadPricingFromDb } = await import('@/lib/ai/ai-cost-logger');
        await expect(loadPricingFromDb()).rejects.toThrow(/connection refused/);
    });

    it('throws when no active rows exist', async () => {
        pricingRows = [];
        const { loadPricingFromDb } = await import('@/lib/ai/ai-cost-logger');
        await expect(loadPricingFromDb()).rejects.toThrow(/no active rows/);
    });
});

describe('logGeminiUsage', () => {
    it('inserts a row with the DB-loaded rate', async () => {
        const { logGeminiUsage } = await import('@/lib/ai/ai-cost-logger');
        await logGeminiUsage(
            { promptTokenCount: 1_000_000, candidatesTokenCount: 500_000, totalTokenCount: 1_500_000 },
            { endpoint: 'diagnose/classify', modelName: 'gemini-2.5-flash' },
        );
        expect(insertedCostEvents).toHaveLength(1);
        const row = insertedCostEvents[0];
        expect(row.endpoint).toBe('diagnose/classify');
        expect(row.model_name).toBe('gemini-2.5-flash');
        expect(row.prompt_tokens).toBe(1_000_000);
        expect(row.completion_tokens).toBe(500_000);
        // 0.30 input + 0.50 output = 0.80
        expect(Number(row.estimated_usd)).toBeCloseTo(0.8, 6);
    });

    it('falls back to FALLBACK_PRICING when the DB lookup fails', async () => {
        pricingError = { message: 'DB unreachable' };
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { logGeminiUsage } = await import('@/lib/ai/ai-cost-logger');
        await logGeminiUsage(
            { promptTokenCount: 1_000_000, candidatesTokenCount: 0, totalTokenCount: 1_000_000 },
            { endpoint: 'diagnose/classify', modelName: 'gemini-2.5-flash' },
        );
        // Insert still happened, priced from FALLBACK_PRICING.
        expect(insertedCostEvents).toHaveLength(1);
        expect(Number(insertedCostEvents[0].estimated_usd)).toBeCloseTo(0.30, 6);
        // Warning emitted with the documented event name.
        const warnedEvents = warnSpy.mock.calls
            .map((c) => {
                try { return JSON.parse(c[0] as string); } catch { return null; }
            })
            .filter((v): v is { event?: string } => v !== null);
        expect(warnedEvents.some((e) => e.event === 'pricing_db_unavailable_using_fallback')).toBe(true);
        warnSpy.mockRestore();
    });

    it('is a no-op when usageMetadata is null/undefined', async () => {
        const { logGeminiUsage } = await import('@/lib/ai/ai-cost-logger');
        await logGeminiUsage(null, { endpoint: 'x', modelName: 'gemini-2.5-flash' });
        await logGeminiUsage(undefined, { endpoint: 'x', modelName: 'gemini-2.5-flash' });
        expect(insertedCostEvents).toHaveLength(0);
    });
});
