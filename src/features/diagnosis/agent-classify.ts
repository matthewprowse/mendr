/* eslint-disable no-console */
/**
 * Agent 2a — Classification sub-agent.
 *
 * A fast, schema-enforced Gemini call that locks in the categorical fields
 * (trade, urgency, confidence, flags) BEFORE the prose agent runs.
 */

import { Type } from '@google/genai';
import type { Content as GeminiContent } from '@google/genai';
import {
    getDiagnosisModel,
    getDiagnosisModelByName,
    GEMINI_MODEL_NAME,
} from '@/lib/ai/ai-diagnosis-backend';
import { getGenAiClient } from '@/lib/ai/ai-client';
import { getOrCreateCachedSystemPrompt } from '@/lib/ai/gemini-cache-manager';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
import { logPipelineStep } from '@/lib/ai/ai-logging';
import {
    CLASSIFICATION_SUBCATEGORY_ENUM,
    formatTaxonomyForClassificationPrompt,
    getSubcategoryById,
    TAXONOMY_NONE_ID,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';
import { resolveCanonicalTrade } from '@/lib/diagnosis/trade-resolver';
import {
    resolveVariant,
    getClassificationSystemPrompt,
    getClassifySamplingParams,
    type PromptVariant,
} from '@/features/diagnosis/prompts/variants/prompt-variant';

// ── Output type ────────────────────────────────────────────────────────────────

export interface ClassificationResult {
    trade: string;
    trade_detail: string;
    /** Taxonomy slug; server coerces trade/trade_detail when not none_unmapped. */
    subcategory_id: string;
    /** True when the classify Gemini call threw (distinct from valid model output). */
    requestFailed?: boolean;
    confidence: number;
    rejected: boolean;
    requires_clarification: boolean;
    unserviced: boolean;
    refetch_providers: boolean;
    unsupported_reason: string;
    failed_component: string;
    cascading_damage: string;
    /**
     * Top 3 candidate trades the classifier considered, ranked by score
     * (0-100). Lets the UI surface soft suggestions when the primary trade is
     * N/A or low-confidence ("did you mean Security, Building & Construction,
     * or Welding?"). Always present; empty array when the classifier didn't
     * emit candidates or the response failed.
     */
    trade_candidates: Array<{ trade: string; score: number }>;
}

const CLASSIFICATION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        subcategory_id: {
            type: Type.STRING,
            description: `ROUTING SUBCATEGORIES id. Allowed: ${CLASSIFICATION_SUBCATEGORY_ENUM.join(', ')}. Use none_unmapped when none fit.`,
        },
        trade: {
            type: Type.STRING,
            description:
                'Exactly one of the allowed trade labels, or "N/A" when rejected, unserviced, or unclear.',
        },
        trade_detail: {
            type: Type.STRING,
            description:
                'Short specialty (max 12 words, Headline-Style Title Case). Empty string when not applicable.',
        },
        confidence: {
            type: Type.INTEGER,
            description:
                'Integer 0–100. Below 85 → requires_clarification true.',
        },
        rejected: {
            type: Type.BOOLEAN,
            description:
                'True ONLY when content is clearly not home maintenance.',
        },
        requires_clarification: {
            type: Type.BOOLEAN,
            description: 'True when confidence < 85 or genuinely ambiguous.',
        },
        unserviced: {
            type: Type.BOOLEAN,
            description:
                'True when home-related but not in allowed trades.',
        },
        refetch_providers: {
            type: Type.BOOLEAN,
            description:
                'True ONLY when user asks for different/more providers.',
        },
        unsupported_reason: {
            type: Type.STRING,
            description: 'One sentence explaining why trade is N/A. Empty string when trade is valid.',
        },
        failed_component: {
            type: Type.STRING,
            description:
                'The single specific component that has failed (e.g. "torsion spring", "thermostat", "pressure relief valve", "PCB board", "stop valve"). Empty string only when no component can be identified.',
        },
        cascading_damage: {
            type: Type.STRING,
            description:
                'Secondary mechanical or electrical damage caused by the primary failure (e.g. "bent connecting rod from spring loss", "warped frame from sustained leak", "tripped earth leakage from short to chassis"). Empty string when none.',
        },
        trade_candidates: {
            type: Type.ARRAY,
            description:
                'Top 3 candidate trades you considered, ranked highest-first. Each candidate is the trade label (from the allowed list) and a score 0-100. Always include 3 entries when trade is set or trade is N/A (so the UI can show "did you mean ..."). Order by score descending. Repeat the chosen trade as the first entry. Empty array only if no trade could be considered at all.',
            items: {
                type: Type.OBJECT,
                properties: {
                    trade: {
                        type: Type.STRING,
                        description: 'One of the allowed trade labels exactly.',
                    },
                    score: {
                        type: Type.INTEGER,
                        description: 'Integer 0-100. Higher = stronger candidate.',
                    },
                },
                required: ['trade', 'score'],
            },
        },
    },
    required: [
        'subcategory_id',
        'trade',
        'trade_detail',
        'confidence',
        'rejected',
        'requires_clarification',
        'unserviced',
        'refetch_providers',
        'unsupported_reason',
        'failed_component',
        'cascading_damage',
        'trade_candidates',
    ],
};

const SCHEMA_PROPERTY_ORDER = [
    'subcategory_id',
    'trade',
    'trade_detail',
    'confidence',
    'rejected',
    'requires_clarification',
    'unserviced',
    'refetch_providers',
    'unsupported_reason',
    'failed_component',
    'cascading_damage',
    'trade_candidates',
] as const;

const ORDERED_SCHEMA = {
    ...CLASSIFICATION_SCHEMA,
    properties: Object.fromEntries(SCHEMA_PROPERTY_ORDER.map((k) => [k, CLASSIFICATION_SCHEMA.properties[k]])),
    required: [...SCHEMA_PROPERTY_ORDER],
};

// Exported for prompt-variant resolver (re-exported as `_v25` from
// `prompts/variants/v2_5-builders.ts`). The variant resolver decides whether
// to call this v2.5 baseline or a future v3.5 sibling.
export function buildClassificationSystemPrompt(serviceListText: string): string {
    const taxonomyBlock = formatTaxonomyForClassificationPrompt();
    return `You are a home maintenance classifier for Mendr, a South African home services app. Cape Town context.

YOUR ONLY JOB: examine the image and/or description and return a JSON classification object. Do not write any prose, narrative, or explanation.

Allowed trade labels (use one exactly, or "N/A"):
${serviceListText}

${taxonomyBlock}

Classification rules:
- subcategory_id: pick the single best ROUTING SUBCATEGORIES id, or "${TAXONOMY_NONE_ID}" when absolutely none fit. When not "${TAXONOMY_NONE_ID}", trade and trade_detail MUST match that row exactly.
- trade: one of the allowed labels exactly, or "N/A" when rejected/unserviced/unclear
- trade_detail: Headline-Style Title Case (max 12 words), empty if none / N/A
- confidence: integer 0–100 — SPECIFIC fault certainty:
    95–100 unambiguous fault; 85–94 strongly probable; 70–84 inferred; 50–69 ambiguous; below 50 genuinely unclear → requires_clarification
- rejected: true only if not home maintenance
- requires_clarification: true when confidence < 85 or ambiguous
- unserviced: true when home-related but trade not offered
- refetch_providers: true only when user asks for different providers
- unsupported_reason when trade N/A

MULTI-IMAGE: reconcile evidence across images; prioritise direct mechanical damage.

CLASSIFICATION PRINCIPLE: match by the affected COMPONENT or SYSTEM, not by the words used.
Ask "what system is broken?" — then find the subcategory whose scope covers that system.
A user may describe the same fault in many ways; the scope descriptions handle this.

Gate motor (boundary post, driveway gate) vs garage door motor (ceiling track, overhead door) — these are distinct subcategory_ids.

USER CORRECTIONS BEAT THE PHOTO: If the user explicitly states what the equipment or issue is (e.g. "it's a borehole pump not a pool pump", "this is a gate motor", "I need a plumber"), their statement overrides the image. Update trade, trade_detail, and subcategory_id to match their correction. Cap confidence at 75 unless a new image confirms the corrected assessment.

GENERAL HANDYMAN THRESHOLD: choose General Handyman for minor, cosmetic, or low-skill fixes that do not need a licensed or specialist trade, for example a perished silicone seal, a single loose handle or hinge, a small filler patch, swapping a light bulb, or hanging an item. Choose a specialist trade only when the job genuinely needs that trade's skill, scale, or certification. Never route gas, electrical, structural, or other certification-required work to General Handyman.

ONE PRIMARY TRADE: pick exactly one trade. If two trades are genuinely plausible, choose the higher-confidence one, set requires_clarification true, and list the alternative in trade_candidates. Never emit a combined "X or Y" trade string.`.trim();
}

function canonicalTradeLabel(tradeRaw: string, allowedTradeLabels: string[]): string | null {
    // Single resolver: exact label, trade-noun/hardware synonyms, then taxonomy
    // anchors. Gated by the runtime allowed-label list.
    const resolved = resolveCanonicalTrade(tradeRaw);
    if (!resolved) return null;
    return allowedTradeLabels.find((l) => l.trim().toLowerCase() === resolved.toLowerCase()) ?? null;
}

/** Applies routing coercion from subcategory_id and normalises trade to the catalogue. */
export function finalizeClassificationAgainstCatalogAndTaxonomy(
    parsed: ClassificationResult,
    allowedTradeLabels: string[],
): ClassificationResult {
    const allowedLower = new Set(allowedTradeLabels.map((s) => s.trim().toLowerCase()).filter(Boolean));

    const validIds = new Set(CLASSIFICATION_SUBCATEGORY_ENUM);
    let sid = typeof parsed.subcategory_id === 'string' ? parsed.subcategory_id.trim() : '';
    if (!validIds.has(sid)) sid = TAXONOMY_NONE_ID;

    let trade = typeof parsed.trade === 'string' ? parsed.trade.trim() : 'N/A';
    let detail = typeof parsed.trade_detail === 'string' ? parsed.trade_detail.trim() : '';
    const rejected = Boolean(parsed.rejected);
    let unserviced = Boolean(parsed.unserviced);

    // Trust-the-taxonomy guard: if the model picked a valid subcategory_id but
    // ALSO flagged unserviced=true, the model is self-contradicting. The
    // taxonomy is ground truth — a valid subcategory means we DO service this.
    // Override unserviced to false so the row lookup below proceeds and the
    // trade is coerced from the taxonomy row. This is the root cause of the
    // "garage door spring failure → Service Not Currently Supported" bug seen
    // in production (e.g. subcategory_id='garage_door_fault' with unserviced=
    // true would otherwise short-circuit to N/A).
    if (unserviced && sid !== TAXONOMY_NONE_ID && getSubcategoryById(sid)) {
        console.warn(
            JSON.stringify({
                event: 'classification.unserviced_overridden_by_taxonomy',
                reason:
                    'model returned unserviced=true alongside a valid subcategory_id; trusting the taxonomy',
                subcategory_id: sid,
                model_trade: trade,
            }),
        );
        unserviced = false;
        parsed.unserviced = false;
    }

    const row = rejected || unserviced ? undefined : getSubcategoryById(sid);

    if (row) {
        trade = row.trade;
        detail = row.label;
    }

    const tradeCanon = canonicalTradeLabel(trade, allowedTradeLabels);
    if (!rejected && !unserviced) {
        if (tradeCanon) {
            trade = tradeCanon;
        } else if (trade.toLowerCase() !== 'n/a') {
            trade = 'N/A';
            detail = '';
            parsed.requires_clarification = true;
            if (!(typeof parsed.unsupported_reason === 'string' && parsed.unsupported_reason.trim())) {
                parsed.unsupported_reason = 'Trade could not be matched to supported services.';
            }
        }
    } else if (trade.toLowerCase() !== 'n/a' && tradeCanon) {
        trade = tradeCanon;
    } else if (trade.toLowerCase() !== 'n/a' && !tradeCanon && !allowedLower.has(trade.toLowerCase())) {
        trade = 'N/A';
    }

    // Coerce trade_candidates from the model output. Tolerant: accepts missing
    // arrays, missing fields, oversized lists. Cap at 3, deduplicate by trade
    // label (keeping the highest score), and only retain entries whose trade
    // label is in the allowed catalogue or 'N/A'.
    const rawCandidates: unknown = parsed.trade_candidates;
    const candidateInputs: Array<{ trade: string; score: number }> = Array.isArray(rawCandidates)
        ? rawCandidates
              .map((c: unknown) => {
                  if (typeof c !== 'object' || c == null) return null;
                  const obj = c as Record<string, unknown>;
                  const rawTrade = typeof obj.trade === 'string' ? obj.trade.trim() : '';
                  if (!rawTrade) return null;
                  const canon = canonicalTradeLabel(rawTrade, allowedTradeLabels);
                  const tradeOut = canon ?? (rawTrade.toLowerCase() === 'n/a' ? 'N/A' : null);
                  if (!tradeOut) return null;
                  const score = typeof obj.score === 'number' && Number.isFinite(obj.score)
                      ? Math.max(0, Math.min(100, Math.round(obj.score)))
                      : 0;
                  return { trade: tradeOut, score };
              })
              .filter((c): c is { trade: string; score: number } => c !== null)
        : [];
    const dedupedCandidates = new Map<string, { trade: string; score: number }>();
    for (const c of candidateInputs) {
        const existing = dedupedCandidates.get(c.trade);
        if (!existing || c.score > existing.score) dedupedCandidates.set(c.trade, c);
    }
    const trade_candidates = Array.from(dedupedCandidates.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    return {
        trade,
        trade_detail: detail,
        subcategory_id: sid,
        confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 0))),
        rejected,
        requires_clarification: Boolean(parsed.requires_clarification),
        unserviced,
        refetch_providers: Boolean(parsed.refetch_providers),
        unsupported_reason:
            typeof parsed.unsupported_reason === 'string' ? parsed.unsupported_reason : '',
        failed_component:
            typeof parsed.failed_component === 'string' ? parsed.failed_component : '',
        cascading_damage:
            typeof parsed.cascading_damage === 'string' ? parsed.cascading_damage : '',
        trade_candidates,
    };
}

export const FALLBACK_CLASSIFICATION: ClassificationResult = {
    trade: 'N/A',
    trade_detail: '',
    subcategory_id: TAXONOMY_NONE_ID,
    confidence: 0,
    rejected: false,
    requires_clarification: true,
    unserviced: false,
    refetch_providers: false,
    unsupported_reason: '',
    failed_component: '',
    cascading_damage: '',
    trade_candidates: [],
};

/**
 * Parse a raw Gemini JSON response into a fully validated ClassificationResult.
 *
 * This is the parser/validator boundary used by `runClassification`. Pulled out
 * as a pure function so it can be fixture-tested against a wide range of model
 * outputs (well-formed, malformed, empty, refusal) without needing to mock the
 * Gemini SDK.
 *
 * Returns the parsed result, or `null` when the input is empty/unparseable.
 * Callers should treat `null` as a `requestFailed` outcome and fall back.
 */
export function parseClassificationResponse(
    raw: string,
    allowedTradeLabels: string[],
): ClassificationResult | null {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) return null;
    let parsed: ClassificationResult;
    try {
        parsed = JSON.parse(trimmed) as ClassificationResult;
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return null;
    }
    parsed.confidence = Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 0)));
    return finalizeClassificationAgainstCatalogAndTaxonomy(parsed, allowedTradeLabels);
}

export async function runClassification(
    contents: GeminiContent[],
    serviceListText: string,
    allowedTradeLabels: string[],
    ctx?: {
        userId?: string | null;
        conversationId?: string | null;
        /**
         * Optional prompt-variant override (used by eval / A-B). When unset,
         * the variant is inferred from the effective model name. See
         * `prompts/variants/prompt-variant.ts`.
         */
        promptVariant?: PromptVariant | null;
        /**
         * Optional model override (eval only — gated by
         * ALLOW_MODEL_OVERRIDE_FROM_REQUEST=1 in the API layer). When set,
         * this model is used instead of the env-configured one AND drives
         * variant inference when promptVariant isn't explicit.
         */
        modelOverride?: string | null;
    },
): Promise<ClassificationResult> {
    const requestedModel = ctx?.modelOverride || GEMINI_MODEL_NAME;
    const variant = resolveVariant({
        override: ctx?.promptVariant,
        model: requestedModel,
    });
    const variantCtx = { variant };
    // ── Mixed-tier classifier (cost-cut Deliverable 1) ──────────────────────
    // Classification output is small structured JSON (~200 tokens). The
    // v3.5-native pipeline pays for 3.5 Flash on prose, but the classifier
    // can run on the much cheaper 2.0 Flash Lite without quality loss
    // (validated in the earlier 2.5 Flash → 3.5 Flash eval matrix where
    // mixed-tier classify already produced identical confusion-matrix rows).
    // For every OTHER variant (v2.5, v3.5, v2.5-polished) we leave behaviour
    // unchanged so production paths are untouched.
    // v3.5-native classifier uses a cheaper model for the cost win — Agent 2a
    // output is tiny structured JSON so cheap models handle it well, while
    // 3.5 Flash stays on prose where diagnostic richness matters.
    //
    // 2026-05-29: Google retired `gemini-2.0-flash-lite` ("no longer available
    // to new users" 404 from the API). We default to `gemini-2.5-flash` as
    // the next-cheapest model that is guaranteed available — still a 5×
    // cost cut vs 3.5 Flash on classify. Override via `V35_NATIVE_CLASSIFY_MODEL`
    // env if Google brings a cheaper tier back online (or if you want to
    // experiment with `gemini-2.5-flash-lite` once verified).
    const v35NativeClassifyModel =
        process.env.V35_NATIVE_CLASSIFY_MODEL || 'gemini-2.5-flash';
    const effectiveModel =
        variant === 'v3.5-native'
            ? v35NativeClassifyModel
            : requestedModel;
    const stepStart = Date.now();
    // Mock branch — used by Playwright E2E to avoid real Gemini calls.
    // Pinned fixture `01-garage-door-spring.json` matches the homeowner golden-path
    // input (a leaking geyser-style description is mapped to Plumbing below; the
    // fixture is intentionally a single deterministic response — see
    // .env.test.example for the full mock contract).
    if (process.env.MOCK_LLM === '1') {
        const mock: ClassificationResult = {
            trade: 'Plumbing',
            trade_detail: 'Geyser / Hot Water Cylinder Repair',
            subcategory_id: 'geyser_fault',
            confidence: 92,
            rejected: false,
            requires_clarification: false,
            unserviced: false,
            refetch_providers: false,
            unsupported_reason: '',
            failed_component: 'pressure relief valve',
            cascading_damage: '',
            trade_candidates: [
                { trade: 'Plumbing', score: 92 },
                { trade: 'General Handyman', score: 35 },
                { trade: 'Electrical', score: 10 },
            ],
        };
        logPipelineStep({
            stepName: 'agent-classify', status: 'ok', durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId, userId: ctx?.userId,
            modelName: 'mock-llm',
        });
        return mock;
    }
    try {
        // For v3.5-native, instantiate the cheaper Lite model explicitly
        // rather than letting `ctx.modelOverride` decide — the variant gate
        // above already redirected `effectiveModel` to gemini-2.0-flash-lite.
        // For every other variant, `getDiagnosisModelByName(ctx?.modelOverride)`
        // is unchanged, preserving production behaviour.
        const baseModel =
            variant === 'v3.5-native'
                ? getDiagnosisModelByName(effectiveModel)
                : getDiagnosisModelByName(ctx?.modelOverride);
        const systemBlock = getClassificationSystemPrompt(serviceListText, variantCtx);
        const sampling = getClassifySamplingParams(variantCtx);

        // ── Context caching (Gemini 3.5 Flash on v3.5 variant) ────────────────
        // The classifier's system prompt (taxonomy block + commit rules + worked
        // example) is identical across every diagnosis for a given service
        // catalogue — roughly 13K tokens of pure boilerplate. By caching it at
        // the cached-input rate ($0.15/1M for 3.5 Flash, 10× cheaper than the
        // regular $1.50/1M), we cut ~90% off the classify input cost. The
        // user-specific images + conversation text + task hint are NOT cached
        // and still billed at the regular rate.
        //
        // Only gated on:
        //   • v3.5 variant (caching for 3.5 Flash is where the cost pressure is)
        //   • GEMINI_CACHE_ENABLED env is not explicitly '0' (off-switch)
        //   • Effective model is gemini-3.5-flash (the rate gap is what makes
        //     caching worthwhile; 2.5 Flash gets a smaller benefit and we'd
        //     pay storage/creation cost without the rate amortising it)
        // On any failure (minimum cache size violation, API error, etc.) the
        // helper returns null and we fall through to the un-cached call.
        // NOTE (Deliverable 1): on v3.5-native the classify model is
        // gemini-2.0-flash-lite. The cache create may fail (Lite has a
        // smaller minimum-cacheable-token requirement than 3.5 Flash AND
        // some cache features differ); we leave the existing fall-through
        // semantics intact — when `getOrCreateCachedSystemPrompt` returns
        // null the code path uses the un-cached `baseModel` automatically.
        // We deliberately do NOT enable caching for v3.5-native here because
        // the cost gap is much smaller on 2.0 Flash Lite (the cached vs
        // un-cached input-rate spread doesn't justify the storage overhead).
        const cacheEnabled =
            process.env.GEMINI_CACHE_ENABLED !== '0' &&
            variantCtx.variant === 'v3.5' &&
            effectiveModel === 'gemini-3.5-flash';
        const cachedContentName = cacheEnabled
            ? await getOrCreateCachedSystemPrompt({
                  model: `models/${effectiveModel}`,
                  systemInstruction: systemBlock,
                  ttlSeconds: 3600,
              })
            : null;

        // System instruction is passed separately from conversation history so it is
        // never accumulated into multi-turn context tokens on follow-up calls.
        const classContents: GeminiContent[] = [
            ...contents,
            {
                role: 'user' as const,
                parts: [
                    {
                        text: 'CLASSIFICATION TASK — respond with ONLY one JSON object matching the schema for the conversation and images above. Review every image before deciding.',
                    },
                ],
            },
        ];

        const ai = getGenAiClient();
        const geminiStartedAt = Date.now();
        const result = await ai.models.generateContent({
            model: baseModel.model,
            contents: classContents,
            config: {
                ...sampling,
                responseMimeType: 'application/json',
                responseSchema: ORDERED_SCHEMA,
                ...(cachedContentName
                    ? { cachedContent: cachedContentName }
                    : { systemInstruction: systemBlock }),
            },
        });
        const latencyMs = Date.now() - geminiStartedAt;

        const usage = result.usageMetadata;

        // Fire-and-forget cost log — never blocks the response
        void logGeminiUsage(usage, {
            endpoint: 'diagnose/classify',
            modelName: effectiveModel,
            userId: ctx?.userId,
            conversationId: ctx?.conversationId,
            latencyMs,
        });

        const raw = (result.text ?? '').trim();
        const out = parseClassificationResponse(raw, allowedTradeLabels);
        if (!out) {
            const reason = raw ? 'JSON parse failed' : 'empty model text';
            console.error(`[agent-classify] ${reason}`, raw ? raw.slice(0, 400) : {
                cand: result.candidates?.length ?? 0,
            });
            logPipelineStep({
                stepName: 'agent-classify', status: 'error', durationMs: Date.now() - stepStart,
                conversationId: ctx?.conversationId, userId: ctx?.userId,
                modelName: effectiveModel, errorMessage: reason,
                promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount,
            });
            return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
        }

        logPipelineStep({
            stepName: 'agent-classify', status: 'ok', durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId, userId: ctx?.userId,
            modelName: effectiveModel,
            promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount,
            cachedContentTokens: usage?.cachedContentTokenCount,
        });
        return out;
    } catch (e) {
        console.error('[agent-classify] generateContent threw', e);
        logPipelineStep({
            stepName: 'agent-classify', status: 'error', durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId, userId: ctx?.userId,
            modelName: effectiveModel,
            errorMessage: e instanceof Error ? e.message : String(e),
        });
        return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
    }
}
