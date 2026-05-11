/**
 * Agent 2a — Classification sub-agent.
 *
 * A fast, schema-enforced Gemini call that locks in the categorical fields
 * (trade, urgency, confidence, flags) BEFORE the prose agent runs.
 */

import { SchemaType } from '@google/generative-ai';
import type { Content as GeminiContent } from '@google/generative-ai';
import { getDiagnosisModel } from '@/lib/ai-diagnosis-backend';
import {
    CLASSIFICATION_SUBCATEGORY_ENUM,
    formatTaxonomyForClassificationPrompt,
    getSubcategoryById,
    TAXONOMY_NONE_ID,
} from '@/lib/diagnosis-trade-taxonomy';
import { tradeToServiceLabel } from '@/lib/services';

// ── Output type ────────────────────────────────────────────────────────────────

export interface ClassificationResult {
    trade: string;
    trade_detail: string;
    /** Taxonomy slug; server coerces trade/trade_detail when not none_unmapped. */
    subcategory_id: string;
    /** True when the classify Gemini call threw (distinct from valid model output). */
    requestFailed?: boolean;
    urgency_key: 'immediate' | 'urgent' | 'soon' | 'planned';
    confidence: number;
    rejected: boolean;
    requires_clarification: boolean;
    unserviced: boolean;
    refetch_providers: boolean;
    unsupported_reason: string;
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
        urgency_key: {
            type: SchemaType.STRING,
            enum: ['immediate', 'urgent', 'soon', 'planned'],
            description: 'Severity rubric mapping.',
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
            description: 'WHY trade is N/A. Empty string when trade is valid.',
        },
    },
    required: [
        'subcategory_id',
        'trade',
        'trade_detail',
        'urgency_key',
        'confidence',
        'rejected',
        'requires_clarification',
        'unserviced',
        'refetch_providers',
        'unsupported_reason',
    ],
};

const SCHEMA_PROPERTY_ORDER = [
    'subcategory_id',
    'trade',
    'trade_detail',
    'urgency_key',
    'confidence',
    'rejected',
    'requires_clarification',
    'unserviced',
    'refetch_providers',
    'unsupported_reason',
] as const;

const ORDERED_SCHEMA = {
    ...CLASSIFICATION_SCHEMA,
    properties: Object.fromEntries(SCHEMA_PROPERTY_ORDER.map((k) => [k, CLASSIFICATION_SCHEMA.properties[k]])),
    required: [...SCHEMA_PROPERTY_ORDER],
};

function buildClassificationSystemPrompt(serviceListText: string): string {
    const taxonomyBlock = formatTaxonomyForClassificationPrompt();
    return `You are a home maintenance classifier for Scandio, a South African home services app. Cape Town context.

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
- urgency_key rubric:
    • immediate — life-safety, active harm, or cannot secure premises
    • urgent — system down, book within days
    • soon — inconvenience, manual workaround exists
    • planned — cosmetic / routine
- unsupported_reason when trade N/A

MULTI-IMAGE: reconcile evidence across images; prioritise direct mechanical damage.

CLASSIFICATION PRINCIPLE: match by the affected COMPONENT or SYSTEM, not by the words used.
Ask "what system is broken?" — then find the subcategory whose scope covers that system.
A user may describe the same fault in many ways; the scope descriptions handle this.

Gate motor (boundary post, driveway gate) vs garage door motor (ceiling track, overhead door) — these are distinct subcategory_ids.

USER CORRECTIONS BEAT THE PHOTO`.trim();
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
    parsed: Omit<ClassificationResult, 'urgency_key'> & { urgency_key: string },
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

    const validUrgency = new Set<string>(['immediate', 'urgent', 'soon', 'planned']);
    let urg = parsed.urgency_key;
    if (!validUrgency.has(String(urg))) urg = 'soon';

    return {
        trade,
        trade_detail: detail,
        subcategory_id: sid,
        urgency_key: urg as ClassificationResult['urgency_key'],
        confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 0))),
        rejected,
        requires_clarification: Boolean(parsed.requires_clarification),
        unserviced,
        refetch_providers: Boolean(parsed.refetch_providers),
        unsupported_reason:
            typeof parsed.unsupported_reason === 'string' ? parsed.unsupported_reason : '',
    };
}

const FALLBACK_CLASSIFICATION: ClassificationResult = {
    trade: 'N/A',
    trade_detail: '',
    subcategory_id: TAXONOMY_NONE_ID,
    urgency_key: 'soon',
    confidence: 0,
    rejected: false,
    requires_clarification: true,
    unserviced: false,
    refetch_providers: false,
    unsupported_reason: '',
};

export async function runClassification(
    contents: GeminiContent[],
    serviceListText: string,
    allowedTradeLabels: string[],
): Promise<ClassificationResult> {
    try {
        const model = getDiagnosisModel();
        const systemBlock = buildClassificationSystemPrompt(serviceListText);

        // System prompt goes first so the model reads the rules before the images/history.
        // The classification task instruction goes last so it is the final user turn the model acts on.
        const classContents: GeminiContent[] = [
            {
                role: 'user' as const,
                parts: [{ text: systemBlock }],
            },
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

        const raw = result.response.text().trim();
        if (!raw) {
            console.error('[agent-classify] empty model text', {
                cand: result.response.candidates?.length ?? 0,
            });
            return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
        }

        let parsed: ClassificationResult;
        try {
            parsed = JSON.parse(raw) as ClassificationResult;
        } catch {
            console.error('[agent-classify] JSON.parse failed', raw.slice(0, 400));
            return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
        }

        parsed.confidence = Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 0)));

        const out = finalizeClassificationAgainstCatalogAndTaxonomy(parsed, allowedTradeLabels);
        return out;
    } catch (e) {
        console.error('[agent-classify] generateContent threw', e);
        return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
    }
}
