/**
 * Agent 2a — Classification sub-agent.
 *
 * A fast, schema-enforced Gemini call that locks in the categorical fields
 * (trade, urgency, confidence, flags) BEFORE the prose agent runs.
 */

import { SchemaType } from '@google/generative-ai';
import type { Content as GeminiContent } from '@google/generative-ai';
import { getDiagnosisModel, GEMINI_MODEL_NAME } from '@/lib/ai/ai-diagnosis-backend';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
import { logPipelineStep } from '@/lib/ai/ai-logging';
import {
    CLASSIFICATION_SUBCATEGORY_ENUM,
    formatTaxonomyForClassificationPrompt,
    getSubcategoryById,
    TAXONOMY_NONE_ID,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';
import { tradeToServiceLabel } from '@/lib/services';

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
}

const CLASSIFICATION_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        subcategory_id: {
            type: SchemaType.STRING,
            description: `ROUTING SUBCATEGORIES id. Allowed: ${CLASSIFICATION_SUBCATEGORY_ENUM.join(', ')}. Use none_unmapped when none fit.`,
        },
        trade: {
            type: SchemaType.STRING,
            description:
                'Exactly one of the allowed trade labels, or "N/A" when rejected, unserviced, or unclear.',
        },
        trade_detail: {
            type: SchemaType.STRING,
            description:
                'Short specialty (max 12 words, Headline-Style Title Case). Empty string when not applicable.',
        },
        confidence: {
            type: SchemaType.INTEGER,
            description:
                'Integer 0–100. Below 85 → requires_clarification true.',
        },
        rejected: {
            type: SchemaType.BOOLEAN,
            description:
                'True ONLY when content is clearly not home maintenance.',
        },
        requires_clarification: {
            type: SchemaType.BOOLEAN,
            description: 'True when confidence < 85 or genuinely ambiguous.',
        },
        unserviced: {
            type: SchemaType.BOOLEAN,
            description:
                'True when home-related but not in allowed trades.',
        },
        refetch_providers: {
            type: SchemaType.BOOLEAN,
            description:
                'True ONLY when user asks for different/more providers.',
        },
        unsupported_reason: {
            type: SchemaType.STRING,
            description: 'One sentence explaining why trade is N/A. Empty string when trade is valid.',
        },
        failed_component: {
            type: SchemaType.STRING,
            description:
                'The single specific component that has failed (e.g. "torsion spring", "thermostat", "pressure relief valve", "PCB board", "stop valve"). Empty string only when no component can be identified.',
        },
        cascading_damage: {
            type: SchemaType.STRING,
            description:
                'Secondary mechanical or electrical damage caused by the primary failure (e.g. "bent connecting rod from spring loss", "warped frame from sustained leak", "tripped earth leakage from short to chassis"). Empty string when none.',
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
] as const;

const ORDERED_SCHEMA = {
    ...CLASSIFICATION_SCHEMA,
    properties: Object.fromEntries(SCHEMA_PROPERTY_ORDER.map((k) => [k, CLASSIFICATION_SCHEMA.properties[k]])),
    required: [...SCHEMA_PROPERTY_ORDER],
};

function buildClassificationSystemPrompt(serviceListText: string): string {
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

USER CORRECTIONS BEAT THE PHOTO: If the user explicitly states what the equipment or issue is (e.g. "it's a borehole pump not a pool pump", "this is a gate motor", "I need a plumber"), their statement overrides the image. Update trade, trade_detail, and subcategory_id to match their correction. Cap confidence at 75 unless a new image confirms the corrected assessment.`.trim();
}

function canonicalTradeLabel(tradeRaw: string, allowedTradeLabels: string[]): string | null {
    const t = typeof tradeRaw === 'string' ? tradeRaw.trim() : '';
    if (!t || t === 'N/A') return null;
    const lowered = allowedTradeLabels.map((s) => s.trim()).filter(Boolean);
    const hit = lowered.find((l) => l.toLowerCase() === t.toLowerCase());
    if (hit) return hit;
    const mapped = tradeToServiceLabel(t);
    if (mapped && lowered.some((l) => l.toLowerCase() === mapped.toLowerCase())) {
        return lowered.find((l) => l.toLowerCase() === mapped.toLowerCase())!;
    }
    return null;
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
    const unserviced = Boolean(parsed.unserviced);

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
    ctx?: { userId?: string | null; conversationId?: string | null },
): Promise<ClassificationResult> {
    const stepStart = Date.now();
    try {
        const model = getDiagnosisModel();
        const systemBlock = buildClassificationSystemPrompt(serviceListText);

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

        const result = await model.generateContent({
            systemInstruction: { role: 'system', parts: [{ text: systemBlock }] },
            contents: classContents,
            generationConfig: {
                temperature: 0.1,
                topK: 10,
                topP: 0.6,
                maxOutputTokens: 520,
                responseMimeType: 'application/json',
                responseSchema: ORDERED_SCHEMA as any,
            },
        });

        const usage = result.response.usageMetadata;

        // Fire-and-forget cost log — never blocks the response
        void logGeminiUsage(usage, {
            endpoint: 'diagnose/classify',
            modelName: GEMINI_MODEL_NAME,
            userId: ctx?.userId,
            conversationId: ctx?.conversationId,
        });

        const raw = result.response.text().trim();
        const out = parseClassificationResponse(raw, allowedTradeLabels);
        if (!out) {
            const reason = raw ? 'JSON parse failed' : 'empty model text';
            console.error(`[agent-classify] ${reason}`, raw ? raw.slice(0, 400) : {
                cand: result.response.candidates?.length ?? 0,
            });
            logPipelineStep({
                stepName: 'agent-classify', status: 'error', durationMs: Date.now() - stepStart,
                conversationId: ctx?.conversationId, userId: ctx?.userId,
                modelName: GEMINI_MODEL_NAME, errorMessage: reason,
                promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount,
            });
            return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
        }

        logPipelineStep({
            stepName: 'agent-classify', status: 'ok', durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId, userId: ctx?.userId,
            modelName: GEMINI_MODEL_NAME,
            promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount,
        });
        return out;
    } catch (e) {
        console.error('[agent-classify] generateContent threw', e);
        logPipelineStep({
            stepName: 'agent-classify', status: 'error', durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId, userId: ctx?.userId,
            modelName: GEMINI_MODEL_NAME,
            errorMessage: e instanceof Error ? e.message : String(e),
        });
        return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
    }
}
