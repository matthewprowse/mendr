/**
 * Gemini AI cost logging.
 *
 * Wraps a generateContent result, extracts usageMetadata, prices it from the
 * `ai_model_pricing` table (admin-editable, cached in-memory with a short TTL),
 * and inserts a row into `ai_cost_events`. All writes are fire-and-forget — a
 * logging failure never surfaces to the caller. When the pricing table is
 * unreachable we fall back to FALLBACK_PRICING so cost rows are never lost.
 *
 * Rates live in the DB (per 1,000,000 tokens) and are converted to per-token
 * here. Update them via the admin AI pricing UI / `/api/admin/ai-pricing`, which
 * calls invalidatePricingCache() so new rates are observed immediately.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

// ─── Pricing types ──────────────────────────────────────────────────────────
/** Per-token USD rates for one model. `cachedInput` is omitted when the model has no cache tier. */
export type ModelRate = { input: number; output: number; cachedInput?: number };
export type PricingTable = Record<string, ModelRate>;

/**
 * Per-token fallback rates, used only when `ai_model_pricing` is unreachable.
 * Keep roughly in sync with the seeded DB rows; the DB is always authoritative.
 */
export const FALLBACK_PRICING: PricingTable = {
    'gemini-3.5-flash': {
        input: 1.5 / 1_000_000,
        output: 9.0 / 1_000_000,
        cachedInput: 0.15 / 1_000_000,
    },
    'gemini-2.5-flash': {
        input: 0.3 / 1_000_000,
        output: 2.5 / 1_000_000,
        cachedInput: 0.03 / 1_000_000,
    },
    'gemini-2.5-flash-preview': {
        input: 0.3 / 1_000_000,
        output: 2.5 / 1_000_000,
        cachedInput: 0.03 / 1_000_000,
    },
    'gemini-2.0-flash': { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
    'gemini-2.0-flash-lite': { input: 0.075 / 1_000_000, output: 0.3 / 1_000_000 },
};

/** Default per-token rate when a model name matches nothing in the table (≈ 2.5 Flash). */
const DEFAULT_RATE: ModelRate = { input: 0.3 / 1_000_000, output: 1.0 / 1_000_000 };

function resolveRate(table: PricingTable, modelName: string): ModelRate {
    // Prefix match so revision suffixes ('-001', '-exp-0205', '-preview') resolve.
    const key = Object.keys(table).find((k) => modelName.startsWith(k));
    return key ? table[key] : DEFAULT_RATE;
}

/**
 * Compute the USD cost of a single call from a per-token pricing table.
 * When the model has a `cachedInput` rate, `cachedTokens` of the prompt are
 * billed at that rate and the remainder at the regular input rate; otherwise
 * `cachedTokens` is ignored.
 */
export function estimateUsdWithTable(
    table: PricingTable,
    modelName: string,
    promptTokens: number,
    completionTokens: number,
    cachedTokens: number = 0,
): number {
    const rate = resolveRate(table, modelName);
    if (typeof rate.cachedInput === 'number') {
        const cached = Math.max(0, Math.min(cachedTokens, promptTokens));
        const regular = promptTokens - cached;
        return (
            regular * rate.input + cached * rate.cachedInput + completionTokens * rate.output
        );
    }
    return promptTokens * rate.input + completionTokens * rate.output;
}

// ─── DB-backed pricing with in-memory cache ─────────────────────────────────
const PRICING_TTL_MS = 5 * 60 * 1000;
let cachedPricing: PricingTable | null = null;
let cachedAt = 0;

/** Drop the cached pricing table so the next cost log reloads from the DB. */
export function invalidatePricingCache(): void {
    cachedPricing = null;
    cachedAt = 0;
}

/** Load the active pricing rows and convert per-1M USD rates to per-token. Throws on error or empty. */
export async function loadPricingFromDb(): Promise<PricingTable> {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('ai_model_pricing')
        .select('model_name, input_per_1m_usd, output_per_1m_usd, cached_input_per_1m_usd')
        .is('effective_until', null);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('ai_model_pricing has no active rows');

    const table: PricingTable = {};
    for (const row of data as Array<{
        model_name: string;
        input_per_1m_usd: number;
        output_per_1m_usd: number;
        cached_input_per_1m_usd: number | null;
    }>) {
        const rate: ModelRate = {
            input: Number(row.input_per_1m_usd) / 1_000_000,
            output: Number(row.output_per_1m_usd) / 1_000_000,
        };
        if (row.cached_input_per_1m_usd != null) {
            rate.cachedInput = Number(row.cached_input_per_1m_usd) / 1_000_000;
        }
        table[row.model_name] = rate;
    }
    return table;
}

async function getPricingTable(): Promise<PricingTable> {
    const now = Date.now();
    if (cachedPricing && now - cachedAt < PRICING_TTL_MS) return cachedPricing;
    const table = await loadPricingFromDb();
    cachedPricing = table;
    cachedAt = now;
    return table;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiCostContext {
    /** The route/function that triggered this call, e.g. 'diagnose/classify'. */
    endpoint: string;
    modelName: string;
    userId?: string | null;
    conversationId?: string | null;
    /** Wall-clock duration of the Gemini call in ms (optional). */
    latencyMs?: number | null;
}

/** usageMetadata shape from @google/generative-ai SDK. Partial across SDK versions. */
export interface GeminiUsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    /** Internal reasoning ("thinking") tokens — billed by Google at the output rate. */
    thoughtsTokenCount?: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log the token usage from a Gemini generateContent response. Fire-and-forget;
 * awaiting is optional but recommended so the row is written before a serverless
 * function exits. Pricing comes from the DB (cached), with a fallback table.
 */
export async function logGeminiUsage(
    usageMetadata: GeminiUsageMetadata | null | undefined,
    ctx: AiCostContext,
): Promise<void> {
    if (!usageMetadata) return;

    const promptTokens = usageMetadata.promptTokenCount ?? 0;
    const candidateTokens = usageMetadata.candidatesTokenCount ?? 0;
    const thoughtTokens = usageMetadata.thoughtsTokenCount ?? 0;
    const totalTokens =
        usageMetadata.totalTokenCount ?? promptTokens + candidateTokens + thoughtTokens;
    const cachedTokens = usageMetadata.cachedContentTokenCount ?? 0;
    // Gemini bills every non-prompt token (visible output + internal "thinking")
    // at the output rate. Derive billable output as total - prompt so thinking
    // tokens are never under-counted, regardless of which SDK fields are populated.
    const completionTokens = Math.max(0, totalTokens - promptTokens);

    let table: PricingTable;
    try {
        table = await getPricingTable();
    } catch (err) {
        console.warn(
            JSON.stringify({
                type: 'ai_cost_log',
                event: 'pricing_db_unavailable_using_fallback',
                endpoint: ctx.endpoint,
                error: err instanceof Error ? err.message : String(err),
            }),
        );
        table = FALLBACK_PRICING;
    }

    const estimatedUsd = estimateUsdWithTable(
        table,
        ctx.modelName,
        promptTokens,
        completionTokens,
        cachedTokens,
    );

    try {
        const admin = await createSupabaseAdminClient();
        const { error } = await admin.from('ai_cost_events').insert({
            endpoint: ctx.endpoint,
            model_name: ctx.modelName,
            user_id: ctx.userId ?? null,
            conversation_id: ctx.conversationId ?? null,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            cached_tokens: cachedTokens,
            total_tokens: totalTokens,
            estimated_usd: estimatedUsd,
            latency_ms: ctx.latencyMs ?? null,
        });

        if (error) {
            console.warn(
                JSON.stringify({
                    type: 'ai_cost_log_error',
                    endpoint: ctx.endpoint,
                    error: error.message,
                }),
            );
        }
    } catch (err) {
        console.warn(
            JSON.stringify({
                type: 'ai_cost_log_error',
                endpoint: ctx.endpoint,
                error: err instanceof Error ? err.message : String(err),
            }),
        );
    }
}

/**
 * Query daily AI cost totals, grouped by date, for the admin dashboard.
 * Returns rows newest-first.
 */
export async function getAiCostDailyTotals(
    days: number = 7,
): Promise<
    Array<{
        date: string;
        total_usd: number;
        total_tokens: number;
        total_cached_tokens: number;
        calls: number;
    }>
> {
    try {
        const admin = await createSupabaseAdminClient();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const { data, error } = await admin
            .from('ai_cost_events')
            .select('created_at, estimated_usd, total_tokens, cached_tokens')
            .gte('created_at', cutoff.toISOString())
            .order('created_at', { ascending: false });

        if (error || !data) return [];

        const byDate = new Map<
            string,
            {
                total_usd: number;
                total_tokens: number;
                total_cached_tokens: number;
                calls: number;
            }
        >();
        for (const row of data) {
            const date = row.created_at.slice(0, 10); // 'YYYY-MM-DD'
            const existing = byDate.get(date) ?? {
                total_usd: 0,
                total_tokens: 0,
                total_cached_tokens: 0,
                calls: 0,
            };
            existing.total_usd += Number(row.estimated_usd) || 0;
            existing.total_tokens += Number(row.total_tokens) || 0;
            existing.total_cached_tokens += Number(row.cached_tokens) || 0;
            existing.calls += 1;
            byDate.set(date, existing);
        }

        return Array.from(byDate.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, stats]) => ({ date, ...stats }));
    } catch {
        return [];
    }
}
