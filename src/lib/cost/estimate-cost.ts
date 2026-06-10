/**
 * LLM cost estimate (ungrounded).
 *
 * One cheap gemini-2.5-flash call that turns a diagnosis into a typical cost
 * breakdown: 2 to 4 line items (callout, labour, parts or replacement), each
 * with a low/high in Rand, plus a one-line note. The model produces the line
 * items from its own knowledge, so it covers any fault rather than a fixed
 * list; we derive the headline range as the sum of the items so the breakdown
 * always adds up.
 *
 * This is an estimate to be confirmed on site, never a quote. The call is
 * cost-logged to ai_cost_events under the 'diagnose/cost-estimate' endpoint, so
 * its real per-call cost shows up alongside classify/prose/critique.
 */
import { Type } from '@google/genai';
import { getGenAiClient } from '@/lib/ai/ai-client';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';

const COST_ESTIMATE_MODEL = process.env.GEMINI_COST_ESTIMATE_MODEL ?? 'gemini-2.5-flash';
const REGION = 'Western Cape, South Africa';

export type CostLineItem = { label: string; low: number; high: number };

export interface CostEstimate {
    line_items: CostLineItem[];
    /** Sum of line-item lows, in Rand. */
    low: number;
    /** Sum of line-item highs, in Rand. */
    high: number;
    currency: 'ZAR';
    note: string;
    /** ISO timestamp the estimate was generated. */
    generated_at: string;
}

const SCHEMA = {
    type: Type.OBJECT,
    properties: {
        line_items: {
            type: Type.ARRAY,
            description:
                '2 to 4 cost components for this job (a callout, labour, and parts or a replacement where relevant), ordered callout-first.',
            items: {
                type: Type.OBJECT,
                properties: {
                    label: {
                        type: Type.STRING,
                        description:
                            'Short label, e.g. "Callout", "Labour (2-4 hrs)", "Parts (replacement motor)".',
                    },
                    low: { type: Type.INTEGER, description: 'Lower bound for this item, in Rand.' },
                    high: { type: Type.INTEGER, description: 'Upper bound for this item, in Rand.' },
                },
                required: ['label', 'low', 'high'],
            },
        },
        note: {
            type: Type.STRING,
            description:
                'One short sentence naming the single biggest factor that swings the price — usually whether the existing component can be reused or refitted (cheaper) or a new part must be bought (dearer).',
        },
    },
    required: ['line_items', 'note'],
};

function systemPrompt(): string {
    return [
        `You estimate typical home-repair costs for homeowners in the ${REGION}.`,
        'Given a diagnosed fault, break the job into 2 to 4 cost components (a callout, labour, and parts or a replacement where relevant),',
        'each with a realistic low and high in South African Rand for the local market.',
        // Reuse-vs-replace principle (general, not fault-specific): a faulty or
        // missing component can often be resolved either by refitting/repairing
        // the existing part (labour-led, little or no new parts) or by buying a
        // new one. These cost very differently, so the range must span both
        // rather than assume the expensive path.
        'A faulty or missing component is often a discrete, swappable part (a spring, motor, valve, handle, sensor). For these, the homeowner may already have the part, may be able to supply it, or the existing one may just need refitting, in which case the job is the callout plus labour with no new-part cost. Other faults need consumables or materials (pipe, sealant, paint, cabling) that always have to be bought.',
        'So for a discrete swappable part, let the parts line item start at or near zero (the homeowner has or supplies it, or it is refitted) and rise to the cost of a brand-new part. Do not assume the homeowner must buy the part. Price consumables and materials normally.',
        'In the note, state the labour-only figure for the case where the homeowner already has or supplies the part, and what a new part adds (for example: "If you already have the spring, expect about the callout plus fitting; new springs add R600 to R2,000.").',
        'Keep ranges sensible and current. This is a rough estimate the homeowner will confirm with a specialist on site, never a binding quote.',
        'Return JSON only, matching the schema.',
    ].join(' ');
}

export interface CostEstimateContext {
    conversationId?: string | null;
    userId?: string | null;
    /** The diagnosis title / headline. */
    title: string;
    /** Supporting detail (the diagnosis message and/or analysis). */
    detail?: string | null;
    trade?: string | null;
    failedComponent?: string | null;
}

function round50(n: number): number {
    return Math.max(0, Math.round(n / 50) * 50);
}

/** Canonicalise and Title Case component labels so they read consistently. */
function canonicalLabel(label: string): string {
    if (/call[\s-]?out/i.test(label)) return 'Call-Out Fee';
    return label
        .trim()
        // Expand time abbreviations: "hrs" -> "Hours", "hr" -> "Hour".
        .replace(/\bhrs?\b/gi, (m) => (m.toLowerCase() === 'hr' ? 'Hour' : 'Hours'))
        // Title Case: capitalise the first letter of each word (at the start or
        // after a space, "(", "/", or "-"), leaving existing caps intact so
        // acronyms like DB, PCB, and RCD survive.
        .replace(/(^|[\s(\/-])([a-z])/g, (_full, pre, ch) => pre + ch.toUpperCase());
}

/** Generate a cost estimate for a diagnosis. Returns null on any failure. */
export async function generateCostEstimate(
    ctx: CostEstimateContext,
): Promise<CostEstimate | null> {
    if (!process.env.GEMINI_API_KEY) return null;

    const userPrompt = [
        `Fault: ${ctx.title}.`,
        ctx.failedComponent ? `Failed component: ${ctx.failedComponent}.` : '',
        ctx.trade ? `Trade: ${ctx.trade}.` : '',
        ctx.detail ? `Details: ${ctx.detail}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    let text = '';
    const callStart = Date.now();
    try {
        const ai = getGenAiClient();
        const result = await ai.models.generateContent({
            model: COST_ESTIMATE_MODEL,
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            config: {
                temperature: 0.2,
                responseMimeType: 'application/json',
                responseSchema: SCHEMA,
                systemInstruction: systemPrompt(),
                // Small thinking budget: a price estimate is a light judgment task
                // (decompose callout / labour / parts), so a little reasoning helps,
                // but it is capped low to keep the call cheap and fast.
                thinkingConfig: { thinkingBudget: 256 },
            },
        });
        const latencyMs = Date.now() - callStart;
        void logGeminiUsage(result.usageMetadata, {
            endpoint: 'diagnose/cost-estimate',
            modelName: COST_ESTIMATE_MODEL,
            userId: ctx.userId ?? null,
            conversationId: ctx.conversationId ?? null,
            latencyMs,
        });
        text = (result.text ?? '').trim();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[cost-estimate] generation failed', err instanceof Error ? err.message : err);
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }

    const rawItems = (parsed as { line_items?: unknown }).line_items;
    if (!Array.isArray(rawItems)) return null;

    const line_items: CostLineItem[] = [];
    for (const it of rawItems) {
        const obj = it as { label?: unknown; low?: unknown; high?: unknown };
        const label = typeof obj.label === 'string' ? obj.label.trim() : '';
        const low = Number(obj.low);
        const high = Number(obj.high);
        if (!label || !Number.isFinite(low) || !Number.isFinite(high)) continue;
        line_items.push({
            label: canonicalLabel(label),
            low: round50(Math.min(low, high)),
            high: round50(Math.max(low, high)),
        });
    }
    if (line_items.length === 0) return null;

    const low = line_items.reduce((s, i) => s + i.low, 0);
    const high = line_items.reduce((s, i) => s + i.high, 0);
    const noteRaw = (parsed as { note?: unknown }).note;

    return {
        line_items,
        low,
        high,
        currency: 'ZAR',
        note: typeof noteRaw === 'string' ? noteRaw.trim() : '',
        generated_at: new Date().toISOString(),
    };
}
