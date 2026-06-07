/**
 * Layer 2 of the forgiving parser: a cheap constrained intent classifier.
 *
 * Maps an ambiguous reply to one of the options currently on screen, or to
 * "unclear". This is constrained classification into a known choice set — not
 * open-ended parsing — so false positives stay low. Runs on gemini-2.5-flash
 * (about $0.0003 per call).
 *
 * Returns the matched 1-based option index, or null for "unclear" / any error.
 * Never throws — the bot must degrade to a gentle re-prompt, never crash.
 */

import { getGenAiClient } from '@/lib/ai/ai-client';
import type { ParserOption, IntentClassifier } from './forgiving-parser';

const CLASSIFIER_MODEL = 'gemini-2.5-flash';

export const classifyIntent: IntentClassifier = async (
    reply: string,
    options: ParserOption[],
): Promise<number | null> => {
    if (!process.env.GEMINI_API_KEY) return null;
    if (options.length === 0) return null;

    const optionLines = options
        .map((o) => `${o.index}. ${o.text}`)
        .join('\n');

    const prompt = `You map a WhatsApp reply to one of the numbered options below, or to 0 when none clearly fit.
This is constrained classification: only choose an option the user is clearly referring to. When in doubt, answer 0.

OPTIONS:
${optionLines}

USER REPLY: ${JSON.stringify(reply)}

Answer with ONLY the single option number (or 0). No words.`;

    try {
        const ai = getGenAiClient();
        const result = await ai.models.generateContent({
            model: CLASSIFIER_MODEL,
            contents: prompt,
            config: {
                temperature: 0,
                maxOutputTokens: 4,
            },
        });
        const text = (result.text ?? '').trim();
        const match = text.match(/-?\d+/);
        if (!match) return null;
        const n = Number(match[0]);
        if (!Number.isFinite(n) || n <= 0) return null;
        return options.some((o) => o.index === n) ? n : null;
    } catch (e) {
        console.warn('[whatsapp/intent] classifyIntent error:', e);
        return null;
    }
};
