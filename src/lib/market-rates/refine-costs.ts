import { getGeminiModel } from '@/lib/ai-client';
import type { MarketRatesRefinedCosts } from './types';

/**
 * Gemini pricing pass: Brave snippets + optional baseline band hints → one `estimated_cost` sentence only.
 */

function tryParseCostJson(text: string): MarketRatesRefinedCosts | null {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        const o = JSON.parse(m[0]) as Record<string, unknown>;
        const est = typeof o.estimated_cost === 'string' ? o.estimated_cost.trim() : '';
        if (!est) return null;
        return { estimated_cost: est };
    } catch {
        return null;
    }
}

export async function refineCostsFromMarketContext(input: {
    diagnosisTitle: string;
    trade: string;
    tradeDetail: string;
    modelContext: string;
    jobScopeHint?: string;
    /**
     * Prior model bands (may be empty). Use only as hints to improve the single sentence — do not output them.
     */
    baseline: {
        estimated_cost?: string;
        repair_cost_range?: string;
        replacement_cost_range?: string;
        equipment_parts_range?: string;
    };
}): Promise<MarketRatesRefinedCosts | null> {
    const ctx = input.modelContext.trim();
    if (ctx.length < 40) return null;

    const scope =
        (input.jobScopeHint ?? '').trim() ||
        '(No size detail in diagnosis — assume typical small residential scope unless web snippets clearly imply otherwise.)';

    const prompt = `You help with a Beta "cost outlook" for a South African homeowner app (Western Cape focus).
Output **one** field only: a single indicative cost sentence. Not a quote.

WEB_SNIPPETS (weak evidence only):
${ctx}

JOB CONTEXT:
- Diagnosis title: ${input.diagnosisTitle}
- Trade: ${input.trade}
- Trade detail: ${input.tradeDetail || 'n/a'}

SCOPE / SIZING HINTS (do not invent measurements):
${scope}

PRIOR MODEL HINTS (optional; fold useful numbers into estimated_cost only — do not echo as separate lines):
- estimated_cost: ${input.baseline.estimated_cost ?? ''}
- repair_cost_range (hint): ${input.baseline.repair_cost_range ?? ''}
- replacement_cost_range (hint): ${input.baseline.replacement_cost_range ?? ''}
- equipment_parts_range (hint): ${input.baseline.equipment_parts_range ?? ''}

TASK:
Return ONE raw JSON object only (no markdown), British English, ZAR with R prefix and spaced thousands.
Single key: estimated_cost — 1–2 short sentences. State assumptions (area, typical fixture, scope). Include per-unit ballparks (e.g. R/m²) inside this sentence when helpful. Prefer "roughly", "ballpark", "if scope is similar".
Never start with "A" or "The". Do not cite URLs. Do not claim contractor quotes.

JSON shape (exactly one key):
{"estimated_cost":""}`;

    try {
        const model = getGeminiModel();
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return tryParseCostJson(text || '');
    } catch {
        return null;
    }
}
