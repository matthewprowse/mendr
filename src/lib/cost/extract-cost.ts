/**
 * Gemini adapter that turns Brave search snippets into a {min, max, note} cost
 * range. This is the only real-LLM piece of the cost pipeline and is called
 * only by the deliberate research trigger, never on a page view. The model is
 * injectable so the parse/validate logic is unit-testable without a real call.
 */

import { getGenAiClient, GEMINI_MODEL_NAME } from '@/lib/ai/ai-client';
import type { CostResearch } from './research-cost';

type GenModel = {
    generateContent: (req: { model: string; contents: unknown; config?: unknown }) => Promise<{ text: string | null }>;
};

const SYSTEM_PROMPT =
    'You research typical South African home-repair costs for the Western Cape. ' +
    'Given web snippets about one fault, output a realistic price range in South African Rand ' +
    'that a homeowner would pay. Be conservative and realistic. Output JSON only.';

function buildUserPrompt(faultLabel: string, snippets: string[]): string {
    const joined = snippets.slice(0, 8).join('\n');
    return (
        `Fault: "${faultLabel}".\n\nWeb snippets:\n${joined}\n\n` +
        'Return a JSON object: {"min_zar": number, "max_zar": number, "unit": string, "note": string}. ' +
        'min_zar/max_zar are the typical low and high in Rand. ' +
        'unit is short context like "callout + repair". ' +
        'note (max 120 chars) names the main repair-vs-replace cost driver, e.g. "Full replacement R5,000-R9,000". ' +
        'If the snippets give no credible pricing, return min_zar 0.'
    );
}

/** Parse and validate the model JSON into a CostResearch, or null. */
export function parseCostJson(raw: string): CostResearch | null {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
    } catch {
        return null;
    }
    const min = Number(parsed.min_zar);
    if (!Number.isFinite(min) || min <= 0) return null;
    const maxRaw = Number(parsed.max_zar);
    const max = Number.isFinite(maxRaw) && maxRaw >= min ? maxRaw : null;
    const unit = typeof parsed.unit === 'string' ? parsed.unit.slice(0, 60) : '';
    const note =
        typeof parsed.note === 'string' && parsed.note.trim()
            ? parsed.note.slice(0, 200)
            : null;
    return { min_zar: min, max_zar: max, unit, note };
}

export async function extractCostWithGemini(
    faultLabel: string,
    snippets: string[],
    deps: { model?: GenModel } = {},
): Promise<CostResearch | null> {
    if (snippets.length === 0) return null;
    // Lazy: only call getGenAiClient() when the default model is actually used
    // (allows tests to inject a mock model without triggering real SDK init).
    const defaultModel: GenModel = {
        generateContent: async (req) => {
            const result = await getGenAiClient().models.generateContent(req as Parameters<ReturnType<typeof getGenAiClient>['models']['generateContent']>[0]);
            return { text: result.text ?? null };
        },
    };
    const model = deps.model ?? defaultModel;

    const result = await model.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(faultLabel, snippets) }] }],
        config: {
            temperature: 0.1,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
            systemInstruction: SYSTEM_PROMPT,
        },
    });

    return parseCostJson(result.text ?? '');
}
