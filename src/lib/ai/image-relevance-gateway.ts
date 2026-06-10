/* eslint-disable no-console */
/**
 * Image Relevance Gateway — cheap pre-pass that runs BEFORE the expensive
 * diagnosis pipeline (Agent 2a classify + Agent 2b prose on 3.5 Flash) to
 * cull obviously-irrelevant uploads (memes, pets, food, screenshots) for
 * roughly $0.0001 a call instead of paying the full ~$0.05 diagnosis cost.
 *
 * Cost economics
 * --------------
 *   Model: gemini-2.0-flash-lite ($0.075/1M input, $0.30/1M output).
 *   Typical call: ~800 prompt tokens (system + tiny user turn + one inline
 *   image at ~256 tokens) + ~50 output tokens.
 *   Per-call cost: 800 * $0.075/1M + 50 * $0.30/1M ≈ $0.000075 (~R0.0014).
 *   That is well under 1% of the diagnosis cost it can avoid; the gateway
 *   pays for itself the first time it rejects in roughly 700 calls.
 *
 * Fail-open contract
 * ------------------
 * Any thrown error — network, model unavailable, parse failure — returns
 * `{ relevant: true, confidence: 50 }`. We MUST NOT block a legitimate
 * diagnosis on a gateway outage; false positives (over-rejection) are far
 * worse UX than letting an edge case through to the main pipeline.
 *
 * User-intent override
 * --------------------
 * When the user types a clearly home-maintenance description ("my geyser is
 * leaking") but the photo is ambiguous (e.g. a wide shot, dim lighting), we
 * bias toward relevant=true with lower confidence — user intent wins. The
 * system prompt makes this explicit.
 */

import { Type } from '@google/genai';
import { getGenAiClient } from '@/lib/ai/ai-client';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
import { imageStringToInlineData } from '@/app/api/diagnose/image-loader';

const GATEWAY_MODEL_NAME = 'gemini-2.0-flash-lite';

export interface RelevanceResult {
    relevant: boolean;
    reason?: string;
    confidence: number;
    tokensUsed: { promptTokens: number; completionTokens: number };
}

// Kept deliberately terse — every token costs money on the gateway. Under
// ~750 tokens by deliberate trim. South African vocabulary inline so the
// model recognises local fixtures (geyser, JoJo tank, palisade fence) as
// relevant without a verbose taxonomy.
const SYSTEM_PROMPT = `You gate uploads for Mendr, a South African home-maintenance diagnosis app. Decide if the photo (and any user text) is something a homeowner would reasonably want a contractor to look at.

RELEVANT (homeowner→contractor work):
- Homes, residential property exteriors and interiors, gardens, driveways, roofs, gutters
- Appliances, fixtures: geyser, oven, fridge, washing machine, dishwasher, taps, sinks, toilets, baths, showers
- Plumbing: leaks, drains, pipes, JoJo tank, pumps, valves
- Electrical: DBs, plugs, switches, lights, wiring, solar inverters, gate motors, garage door motors
- Structural: walls, ceilings, floors, tiles, doors, windows, damp, cracks
- Outdoor: pools, garden tools, irrigation, paving, palisade fence, security gates, intercoms
- Vehicle damage on home property (gate hit by car, garage damaged)

NOT RELEVANT (reject):
- Pets, food, plants without home damage context
- Screenshots of unrelated apps, social media, memes
- Selfies, group photos, people-only photos
- Blank/test images, solid colours
- Commercial buildings (unless small shopfront), public infrastructure, vehicles in traffic, landscapes/scenery without a building

USER INTENT WINS: when the user text clearly describes a home issue but the image is ambiguous or unhelpful, return relevant=true with lower confidence (50-65). Do not reject on image alone if text intent is plausible.

Return ONLY a JSON object:
{ "relevant": boolean, "reason": "one short sentence explaining the decision", "confidence": integer 0-100 }

Confidence guide: 90+ obvious, 70-89 clear, 50-69 uncertain, <50 very uncertain.`;

const RELEVANCE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        relevant: {
            type: Type.BOOLEAN,
            description: 'True if this is something a homeowner would show a contractor.',
        },
        reason: {
            type: Type.STRING,
            description: 'One short sentence explaining the verdict.',
        },
        confidence: {
            type: Type.INTEGER,
            description: 'Integer 0-100. Higher = more certain.',
        },
    },
    required: ['relevant', 'reason', 'confidence'],
};

interface RelevanceJson {
    relevant?: unknown;
    reason?: unknown;
    confidence?: unknown;
}

function coerceResult(parsed: RelevanceJson): {
    relevant: boolean;
    reason: string;
    confidence: number;
} | null {
    if (typeof parsed.relevant !== 'boolean') return null;
    const confidence =
        typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
            : 50;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    return { relevant: parsed.relevant, reason, confidence };
}

/**
 * Cheap LLM check: is this upload a home-maintenance issue?
 *
 * Fails open — any throw or parse failure returns relevant=true so a gateway
 * outage cannot block legitimate diagnoses. Caller is expected to gate
 * rejection on BOTH `relevant === false` AND `confidence >= 70`.
 */
export async function checkImageRelevance(
    imageUrls: string[],
    userText: string | null,
): Promise<RelevanceResult> {
    // ── MOCK_LLM branch (tests + Playwright E2E) ────────────────────────────
    if (process.env.MOCK_LLM === '1') {
        return {
            relevant: true,
            confidence: 95,
            tokensUsed: { promptTokens: 0, completionTokens: 0 },
        };
    }

    try {
        // Convert image URLs → inline-data parts (same loader the main
        // pipeline uses; SSRF/size guardrails are honoured).
        const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
        for (const url of imageUrls) {
            const inline = await imageStringToInlineData(url);
            if (inline) imageParts.push(inline);
        }

        // No usable image AND no text → degenerate; treat as relevant to fall
        // through to the main pipeline which has its own empty-input handler.
        if (imageParts.length === 0 && !(userText && userText.trim())) {
            return {
                relevant: true,
                confidence: 50,
                tokensUsed: { promptTokens: 0, completionTokens: 0 },
            };
        }

        const ai = getGenAiClient();
        const userTurnParts: Array<
            | { text: string }
            | { inlineData: { data: string; mimeType: string } }
        > = [...imageParts];
        if (userText && userText.trim()) {
            userTurnParts.push({ text: `User text: ${userText.trim().slice(0, 500)}` });
        }
        userTurnParts.push({
            text: 'Is this a home-maintenance issue a homeowner would ask a contractor about? Respond with the JSON object only.',
        });

        const geminiStartedAt = Date.now();
        const result = await ai.models.generateContent({
            model: GATEWAY_MODEL_NAME,
            contents: [{ role: 'user', parts: userTurnParts }],
            config: {
                temperature: 0.1,
                topP: 0.8,
                maxOutputTokens: 250,
                responseMimeType: 'application/json',
                responseSchema: RELEVANCE_SCHEMA,
                systemInstruction: SYSTEM_PROMPT,
            },
        });

        const usage = result.usageMetadata;
        void logGeminiUsage(usage, {
            endpoint: 'diagnose/image-relevance-gate',
            modelName: GATEWAY_MODEL_NAME,
            latencyMs: Date.now() - geminiStartedAt,
        });

        const raw = (result.text ?? '').trim();
        let parsed: RelevanceJson | null = null;
        try {
            parsed = JSON.parse(raw) as RelevanceJson;
        } catch {
            // Bad JSON → fail-open (don't block).
            return {
                relevant: true,
                confidence: 50,
                tokensUsed: {
                    promptTokens: usage?.promptTokenCount ?? 0,
                    completionTokens: usage?.candidatesTokenCount ?? 0,
                },
            };
        }

        const coerced = coerceResult(parsed);
        if (!coerced) {
            return {
                relevant: true,
                confidence: 50,
                tokensUsed: {
                    promptTokens: usage?.promptTokenCount ?? 0,
                    completionTokens: usage?.candidatesTokenCount ?? 0,
                },
            };
        }

        return {
            relevant: coerced.relevant,
            reason: coerced.reason || undefined,
            confidence: coerced.confidence,
            tokensUsed: {
                promptTokens: usage?.promptTokenCount ?? 0,
                completionTokens: usage?.candidatesTokenCount ?? 0,
            },
        };
    } catch (err) {
        // Fail-open: a gateway outage must NEVER block a real diagnosis.
        console.warn(
            JSON.stringify({
                type: 'image_relevance_gate_error',
                err: err instanceof Error ? err.message : String(err),
            }),
        );
        return {
            relevant: true,
            confidence: 50,
            tokensUsed: { promptTokens: 0, completionTokens: 0 },
        };
    }
}
