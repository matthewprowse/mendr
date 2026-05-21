/**
 * Gemini AI cost logging.
 *
 * Wraps a generateContent result, extracts usageMetadata, and inserts a row into
 * the ai_cost_events Supabase table.  All writes are fire-and-forget — a logging
 * failure never surfaces to the caller.
 *
 * PRICING CONSTANTS
 * -----------------
 * Update these when Google changes its pricing. Values are per 1,000 tokens (not
 * per 1M) to keep the arithmetic readable.
 *
 * Current approximate Gemini 2.5 Flash pricing (May 2026):
 *   Input:  $0.30 / 1M tokens  →  $0.00030 / 1k tokens
 *   Output: $1.00 / 1M tokens  →  $0.00100 / 1k tokens
 *
 * For gemini-2.0-flash-lite:
 *   Input:  $0.075 / 1M tokens →  $0.000075 / 1k tokens
 *   Output: $0.30  / 1M tokens →  $0.00030  / 1k tokens
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

// ─── Pricing table ────────────────────────────────────────────────────────────
// USD per 1 token. Update when Google changes pricing.

const PRICING: Record<string, { input: number; output: number }> = {
    'gemini-2.5-flash':        { input: 0.30 / 1_000_000,  output: 1.00 / 1_000_000  },
    'gemini-2.5-flash-preview':{ input: 0.30 / 1_000_000,  output: 1.00 / 1_000_000  },
    'gemini-2.0-flash':        { input: 0.10 / 1_000_000,  output: 0.40 / 1_000_000  },
    'gemini-2.0-flash-lite':   { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000  },
};

/** Fallback pricing for unknown model names (use 2.5 Flash as a conservative estimate). */
const DEFAULT_PRICING = PRICING['gemini-2.5-flash'];

function estimateUsd(
    modelName: string,
    promptTokens: number,
    completionTokens: number,
): number {
    // Normalise: strip revision suffixes like '-001' or '-exp-0205'
    const key = Object.keys(PRICING).find((k) => modelName.startsWith(k)) ?? '';
    const rate = PRICING[key] ?? DEFAULT_PRICING;
    return promptTokens * rate.input + completionTokens * rate.output;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiCostContext {
    /** The route/function that triggered this call, e.g. 'diagnose/classify'. */
    endpoint: string;
    modelName: string;
    userId?: string | null;
    conversationId?: string | null;
}

/**
 * usageMetadata shape from @google/generative-ai SDK.
 * Partial because older SDK versions may omit some fields.
 */
export interface GeminiUsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log the token usage from a Gemini generateContent response.
 *
 * Call this after every generateContent / generateContentStream call in the
 * diagnosis pipeline.  It is fire-and-forget — awaiting is optional but
 * recommended if you want the row written before the serverless function exits.
 *
 * @example
 * const result = await model.generateContent({ ... });
 * void logGeminiUsage(result.response.usageMetadata, {
 *     endpoint: 'diagnose/classify',
 *     modelName: GEMINI_MODEL_NAME,
 *     userId,
 *     conversationId,
 * });
 */
export async function logGeminiUsage(
    usageMetadata: GeminiUsageMetadata | null | undefined,
    ctx: AiCostContext,
): Promise<void> {
    if (!usageMetadata) return;

    const promptTokens     = usageMetadata.promptTokenCount     ?? 0;
    const completionTokens = usageMetadata.candidatesTokenCount ?? 0;
    const totalTokens      = usageMetadata.totalTokenCount      ?? promptTokens + completionTokens;
    const estimatedUsd     = estimateUsd(ctx.modelName, promptTokens, completionTokens);

    try {
        const admin = await createSupabaseAdminClient();
        const { error } = await admin.from('ai_cost_events').insert({
            endpoint:          ctx.endpoint,
            model_name:        ctx.modelName,
            user_id:           ctx.userId    ?? null,
            conversation_id:   ctx.conversationId ?? null,
            prompt_tokens:     promptTokens,
            completion_tokens: completionTokens,
            total_tokens:      totalTokens,
            estimated_usd:     estimatedUsd,
        });

        if (error) {
            // Structured log — don't let a logging failure crash the request
            console.warn(JSON.stringify({
                type: 'ai_cost_log_error',
                endpoint: ctx.endpoint,
                error: error.message,
            }));
        }
    } catch (err) {
        console.warn(JSON.stringify({
            type: 'ai_cost_log_error',
            endpoint: ctx.endpoint,
            error: err instanceof Error ? err.message : String(err),
        }));
    }
}

/**
 * Query daily AI cost totals, grouped by date, for the admin dashboard.
 * Returns rows newest-first.
 *
 * @example
 * const rows = await getAiCostDailyTotals(30);
 */
export async function getAiCostDailyTotals(
    days: number = 7,
): Promise<Array<{ date: string; total_usd: number; total_tokens: number; calls: number }>> {
    try {
        const admin = await createSupabaseAdminClient();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const { data, error } = await admin
            .from('ai_cost_events')
            .select('created_at, estimated_usd, total_tokens')
            .gte('created_at', cutoff.toISOString())
            .order('created_at', { ascending: false });

        if (error || !data) return [];

        // Aggregate client-side — avoids needing a Postgres RPC for a simple pivot
        const byDate = new Map<string, { total_usd: number; total_tokens: number; calls: number }>();
        for (const row of data) {
            const date = row.created_at.slice(0, 10); // 'YYYY-MM-DD'
            const existing = byDate.get(date) ?? { total_usd: 0, total_tokens: 0, calls: 0 };
            existing.total_usd    += Number(row.estimated_usd) || 0;
            existing.total_tokens += Number(row.total_tokens)  || 0;
            existing.calls        += 1;
            byDate.set(date, existing);
        }

        return Array.from(byDate.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, stats]) => ({ date, ...stats }));
    } catch {
        return [];
    }
}
