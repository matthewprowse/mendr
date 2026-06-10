/* eslint-disable no-console */
/**
 * Layer 2 of the forgiving parser: a cheap constrained intent classifier.
 *
 * Maps an ambiguous reply to one of the options currently on screen, or to
 * "unclear". This is constrained classification into a known choice set — not
 * open-ended parsing — so false positives stay low. Runs on
 * gemini-2.0-flash-lite (~$0.0001 per call — the task shape matches the image
 * relevance gateway, not the diagnosis pipeline) with a small in-process
 * cache: users repeat the same short replies ("yes pls", "the first one")
 * against the same option sets constantly.
 *
 * Returns the matched 1-based option index, or null for "unclear" / any error.
 * Never throws — the bot must degrade to a gentle re-prompt, never crash.
 */

import { createHash } from 'crypto';
import { getGenAiClient } from '@/lib/ai/ai-client';
import type { ParserOption, IntentClassifier } from './forgiving-parser';

const CLASSIFIER_MODEL =
    process.env.GEMINI_INTENT_CLASSIFIER_MODEL ?? 'gemini-2.0-flash-lite';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { value: number | null; expires: number }>();

function cacheKey(reply: string, options: ParserOption[]): string {
    const h = createHash('sha256');
    h.update(reply.toLowerCase().trim());
    for (const o of options) h.update(`|${o.index}:${o.text}`);
    return h.digest('hex');
}

export const classifyIntent: IntentClassifier = async (
    reply: string,
    options: ParserOption[],
): Promise<number | null> => {
    if (!process.env.GEMINI_API_KEY) return null;
    if (options.length === 0) return null;

    const key = cacheKey(reply, options);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

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
        const n = match ? Number(match[0]) : NaN;
        const value =
            Number.isFinite(n) && n > 0 && options.some((o) => o.index === n)
                ? n
                : null;
        if (cache.size >= CACHE_MAX) {
            const now = Date.now();
            for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
            if (cache.size >= CACHE_MAX) cache.clear();
        }
        cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
        return value;
    } catch (e) {
        console.warn('[whatsapp/intent] classifyIntent error:', e);
        return null;
    }
};
