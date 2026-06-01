/**
 * Agent 3 — Self-critique.
 *
 * Runs fire-and-forget after the diagnose / refine pipeline completes. Emits
 * a structured DiagnosisCritique for every diagnosis, then persists to
 * `diagnoses.diagnosis_critique`. Failures here NEVER break a diagnosis.
 *
 * Source plan: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 2.
 *
 * Gated behind `DIAGNOSIS_AGENT_CRITIQUE_ENABLED=1` so it can be disabled
 * server-wide without a deploy if the Gemini cost rises faster than expected.
 */

import { SchemaType } from '@google/generative-ai';
import type { Content as GeminiContent } from '@google/generative-ai';
import {
    getCritiqueModel,
    GEMINI_CRITIQUE_MODEL_NAME,
} from '@/lib/ai/ai-diagnosis-backend';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
import { logAiCall, textifyGeminiContents } from '@/lib/ai/ai-call-logger';
import { logPipelineStep } from '@/lib/ai/ai-logging';
import { DIAGNOSE_PROMPT_VERSION } from '@/features/diagnosis/prompts/prompt-version';
import {
    buildCritiqueSystemPrompt,
    type DiagnosisOutcome,
} from '@/features/diagnosis/prompts/critique-system';
export type { DiagnosisOutcome };
import {
    resolveVariant,
    getCritiqueSystemPrompt,
    getCritiqueSamplingParams,
    type PromptVariant,
} from '@/features/diagnosis/prompts/variants/prompt-variant';
import type {
    DiagnosisCritique,
    DiagnosisCritiqueFailureMode,
    DiagnosticReasoning,
} from '@/features/diagnosis/types';
import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import type { ProseResult } from '@/features/diagnosis/agent-prose';

// ── Schema ─────────────────────────────────────────────────────────────────────

const FAILURE_MODE_VALUES: DiagnosisCritiqueFailureMode[] = [
    'none',
    'image_quality',
    'ambiguous_symptoms',
    'taxonomy_gap',
    'multi_fault',
    'description_unclear',
    'prompt_blind_spot',
    'low_signal_evidence',
    'rubric_miscalibration',
    'other',
];

const CRITIQUE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        failure_mode: {
            type: SchemaType.STRING,
            description: `Exactly one of: ${FAILURE_MODE_VALUES.join(', ')}.`,
        },
        confidence_calibration: {
            type: SchemaType.OBJECT,
            properties: {
                agent_confidence: { type: SchemaType.INTEGER, description: 'Integer 0-100. The confidence Agent 2a reported.' },
                critique_confidence: { type: SchemaType.INTEGER, description: 'Integer 0-100. What you think the score should be.' },
                delta_reasoning: { type: SchemaType.STRING, description: 'One paragraph. Anchored in specific facts from the user content.' },
                rubric_facets_used: {
                    type: SchemaType.ARRAY,
                    description: 'Short identifiers for facets that informed your critique_confidence.',
                    items: { type: SchemaType.STRING },
                },
            },
            required: ['agent_confidence', 'critique_confidence', 'delta_reasoning', 'rubric_facets_used'],
        },
        knowledge_gap: {
            type: SchemaType.STRING,
            description: 'One concrete sentence naming the gap, or empty string when failure_mode=none.',
        },
        resolution_would_be: {
            type: SchemaType.STRING,
            description: 'One concrete homeowner-facing sentence naming what would close the gap, or empty string.',
        },
        considered_alternatives: {
            type: SchemaType.ARRAY,
            description: 'Plain-language fault names the model considered and discarded, max 8 words each.',
            items: { type: SchemaType.STRING },
        },
        surprise_signals: {
            type: SchemaType.ARRAY,
            description: 'Specific observations the model saw but underweighted.',
            items: { type: SchemaType.STRING },
        },
        prompt_hypothesis: {
            type: SchemaType.STRING,
            description: 'Short identifier of suspected prompt segment (e.g. file.ts:SECTION_NAME), or empty string when unattributable.',
        },
        notes_for_human_review: {
            type: SchemaType.STRING,
            description: '2-3 sentences. Plain English. Briefing for a dashboard reviewer.',
        },
    },
    required: [
        'failure_mode',
        'confidence_calibration',
        'knowledge_gap',
        'resolution_would_be',
        'considered_alternatives',
        'surprise_signals',
        'prompt_hypothesis',
        'notes_for_human_review',
    ],
};

// ── Normaliser ─────────────────────────────────────────────────────────────────

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
    if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, Math.round(n)));
}

function stringOrEmpty(n: unknown): string {
    return typeof n === 'string' ? n.trim() : '';
}

function stringArray(n: unknown): string[] {
    if (!Array.isArray(n)) return [];
    return n
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((s) => s.trim());
}

export function normaliseCritique(raw: unknown): DiagnosisCritique | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;

    const failureModeRaw = stringOrEmpty(r.failure_mode);
    const failure_mode: DiagnosisCritiqueFailureMode = FAILURE_MODE_VALUES.includes(
        failureModeRaw as DiagnosisCritiqueFailureMode,
    )
        ? (failureModeRaw as DiagnosisCritiqueFailureMode)
        : 'other';

    const cc = (r.confidence_calibration ?? {}) as Record<string, unknown>;
    const confidence_calibration = {
        agent_confidence: clampInt(cc.agent_confidence, 0, 100, 0),
        critique_confidence: clampInt(cc.critique_confidence, 0, 100, 0),
        delta_reasoning: stringOrEmpty(cc.delta_reasoning),
        rubric_facets_used: stringArray(cc.rubric_facets_used),
    };

    const knowledgeGapRaw = stringOrEmpty(r.knowledge_gap);
    const resolutionRaw = stringOrEmpty(r.resolution_would_be);
    const promptHypothesisRaw = stringOrEmpty(r.prompt_hypothesis);

    return {
        failure_mode,
        confidence_calibration,
        knowledge_gap:
            failure_mode === 'none' || knowledgeGapRaw.length === 0 ? null : knowledgeGapRaw,
        resolution_would_be:
            failure_mode === 'none' || resolutionRaw.length === 0 ? null : resolutionRaw,
        considered_alternatives: stringArray(r.considered_alternatives),
        surprise_signals: stringArray(r.surprise_signals),
        prompt_hypothesis: promptHypothesisRaw.length === 0 ? null : promptHypothesisRaw,
        notes_for_human_review: stringOrEmpty(r.notes_for_human_review),
    };
}

// ── Runner ─────────────────────────────────────────────────────────────────────

export interface AgentOutputsSummary {
    /** Agent 2a categorical fields (just the subset the critique needs to read). */
    classification: {
        trade: string;
        trade_detail: string;
        subcategory_id?: string;
        confidence: number;
        rejected: boolean;
        requires_clarification: boolean;
        unserviced: boolean;
        failed_component: string;
        cascading_damage: string;
    };
    /** Agent 2b prose subset. */
    prose: {
        thought: string;
        diagnosis: string;
        message: string;
        action_required: string;
    };
    /** Agent 2c reasoning when present. */
    reasoning: DiagnosticReasoning | null;
}

export interface RunCritiqueParams {
    /** The original Gemini conversation contents (user text + images). */
    contents: GeminiContent[];
    /** Agent 2a/2b/2c outputs. */
    agentOutputs: AgentOutputsSummary;
    /** Final outcome the pipeline committed to. */
    outcome: DiagnosisOutcome;
    /** Round 1 for /diagnose, ≥2 for /refine. */
    round: number;
    ctx?: {
        userId?: string | null;
        conversationId?: string | null;
        imageUrls?: string[] | null;
        promptVariant?: PromptVariant | null;
        /**
         * Critique has its own model (GEMINI_CRITIQUE_MODEL) and is NOT
         * affected by the diagnosis-pipeline modelOverride. Per-request
         * model override for critique would be a separate field if needed
         * — currently no eval requires it. Kept out of this ctx for
         * security: lets the request-parser path stay focused on diagnose-
         * pipeline overrides only.
         */
    };
}

const MOCK_CRITIQUE: DiagnosisCritique = {
    failure_mode: 'prompt_blind_spot',
    confidence_calibration: {
        agent_confidence: 78,
        critique_confidence: 90,
        delta_reasoning:
            'User named the failed component directly and the symptom uniquely implicates it. The prompt rubric is undefined for text-only confident cases, so the model defaulted to the conservative side of the 85 threshold.',
        rubric_facets_used: ['component_named', 'symptom_unique', 'description_complete'],
    },
    knowledge_gap: null,
    resolution_would_be: null,
    considered_alternatives: ['Snapped lifting cable', 'Opener motor over-current cutout'],
    surprise_signals: [
        'User stated the spring is missing — single-side absence is a primary fault signal even without an image',
    ],
    prompt_hypothesis: 'output-format.ts:confidence_definition',
    notes_for_human_review:
        'This is the garage-door pattern: text-only complete description, model under-scored confidence. Phase 5 rubric should add an explicit text-only confident-case anchor.',
};

/**
 * Persist a critique to `diagnoses.diagnosis_critique` for the matching row.
 *
 * Uses UPDATE-only (not upsert) so we never insert an orphan row if the
 * client's PATCH hasn't landed yet. If 0 rows are updated, retry once after
 * 500ms (handles the race where critique completes before the PATCH lands).
 * After that, give up and log — the cron in Phase 8 can backfill.
 *
 * Caller is responsible for handling/dropping the returned promise; this
 * function never throws.
 */
export async function persistCritique(
    conversationId: string,
    critique: DiagnosisCritique,
    options: { overwrite?: boolean } = {},
): Promise<{ persisted: boolean; reason?: string }> {
    try {
        const { createSupabaseAdminClient } = await import('@/lib/auth/supabase-server');
        const admin = await createSupabaseAdminClient();

        const attempt = async () => {
            let query = admin
                .from('diagnoses')
                .update({ diagnosis_critique: critique })
                .eq('id', conversationId);
            if (!options.overwrite) {
                // First-write semantics on the /api/diagnose path: only write when
                // no critique exists yet. Prevents accidental clobber if the
                // client retries.
                query = query.is('diagnosis_critique', null);
            }
            const { data, error } = await query.select('id');
            return { matched: Array.isArray(data) && data.length > 0, error };
        };

        const first = await attempt();
        if (first.error) {
            console.warn('[agent-critique] persist error (1)', first.error.message);
            return { persisted: false, reason: first.error.message };
        }
        if (first.matched) return { persisted: true };

        // No row matched — most likely the client PATCH hasn't landed yet.
        await new Promise((r) => setTimeout(r, 500));
        const second = await attempt();
        if (second.error) {
            console.warn('[agent-critique] persist error (2)', second.error.message);
            return { persisted: false, reason: second.error.message };
        }
        if (second.matched) return { persisted: true };

        // Row still missing — Phase 8 cron will backfill.
        console.warn(
            JSON.stringify({
                type: 'ai_critique_unpersisted',
                conversationId,
                reason: 'no_matching_row_after_retry',
            }),
        );
        return { persisted: false, reason: 'no_matching_row_after_retry' };
    } catch (e) {
        console.warn('[agent-critique] persist threw', e instanceof Error ? e.message : e);
        return { persisted: false, reason: e instanceof Error ? e.message : String(e) };
    }
}

export async function runDiagnosisCritique({
    contents,
    agentOutputs,
    outcome,
    round,
    ctx,
}: RunCritiqueParams): Promise<DiagnosisCritique | null> {
    // Honor both flag names — `DIAGNOSIS_AGENT_3_ENABLED` is the Phase 2 spec
    // name; `DIAGNOSIS_AGENT_CRITIQUE_ENABLED` is the pre-existing name kept
    // for backwards compatibility so we can toggle either in production.
    if (
        process.env.DIAGNOSIS_AGENT_3_ENABLED !== '1' &&
        process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED !== '1'
    ) {
        return null;
    }

    const stepStart = Date.now();

    if (process.env.MOCK_LLM === '1') {
        logPipelineStep({
            stepName: 'agent-critique',
            status: 'ok',
            durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId,
            userId: ctx?.userId,
            modelName: 'mock-llm',
        });
        return MOCK_CRITIQUE;
    }

    try {
        // Agent 3 uses its own model constant (defaults to gemini-2.5-flash,
        // independent of the main pipeline). Lets us A/B the diagnosis path
        // between 2.5 Flash and 3.5 Flash while keeping critique cheap.
        const model = getCritiqueModel();
        // Resolve variant against the CRITIQUE model name (which has its own
        // env knob, GEMINI_CRITIQUE_MODEL). Critique can run a different
        // variant from the main pipeline.
        const variant = resolveVariant({
            override: ctx?.promptVariant,
            model: GEMINI_CRITIQUE_MODEL_NAME,
        });
        const variantCtx = { variant };
        const round12 = (round === 2 ? 2 : 1) as 1 | 2;
        const systemPrompt = getCritiqueSystemPrompt({ outcome, round: round12 }, variantCtx);
        const sampling = getCritiqueSamplingParams(variantCtx);

        const agentOutputsBlock = JSON.stringify(agentOutputs, null, 2);

        const critiqueContents: GeminiContent[] = [
            ...contents,
            {
                role: 'user' as const,
                parts: [
                    {
                        text: `AGENT OUTPUTS (read these alongside the user's content above):\n\n${agentOutputsBlock}\n\nApply the critique discipline above and return ONLY the JSON object.`,
                    },
                ],
            },
        ];

        const callStart = Date.now();
        const result = await model.generateContent({
            systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
            contents: critiqueContents,
            generationConfig: {
                ...sampling,
                responseMimeType: 'application/json',
                responseSchema: CRITIQUE_SCHEMA as never,
            },
        });
        const latencyMs = Date.now() - callStart;

        const usage = result.response.usageMetadata;
        void logGeminiUsage(usage, {
            endpoint: 'diagnose/critique',
            modelName: GEMINI_CRITIQUE_MODEL_NAME,
            userId: ctx?.userId,
            conversationId: ctx?.conversationId,
            latencyMs,
        });

        const raw = result.response.text().trim();
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            console.error('[agent-critique] JSON parse failed', raw.slice(0, 400));
            logPipelineStep({
                stepName: 'agent-critique',
                status: 'error',
                durationMs: Date.now() - stepStart,
                conversationId: ctx?.conversationId,
                userId: ctx?.userId,
                modelName: GEMINI_CRITIQUE_MODEL_NAME,
                errorMessage: 'JSON parse failed',
            });
            return null;
        }

        const normalised = normaliseCritique(parsed);
        if (!normalised) {
            logPipelineStep({
                stepName: 'agent-critique',
                status: 'error',
                durationMs: Date.now() - stepStart,
                conversationId: ctx?.conversationId,
                userId: ctx?.userId,
                modelName: GEMINI_CRITIQUE_MODEL_NAME,
                errorMessage: 'normalisation failed',
            });
            return null;
        }

        logPipelineStep({
            stepName: 'agent-critique',
            status: 'ok',
            durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId,
            userId: ctx?.userId,
            modelName: GEMINI_CRITIQUE_MODEL_NAME,
            promptTokens: usage?.promptTokenCount,
            completionTokens: usage?.candidatesTokenCount,
        });

        // Phase 3: full prompt + response logging — scheduled via after()
        logAiCall({
            conversationId: ctx?.conversationId,
            agentId: '3-critique',
            promptText: textifyGeminiContents(systemPrompt, critiqueContents),
            promptVersion: DIAGNOSE_PROMPT_VERSION,
            modelId: GEMINI_CRITIQUE_MODEL_NAME,
            temperature: sampling.temperature,
            topP: sampling.topP,
            topK: sampling.topK,
            responseText: raw,
            responseJson: normalised as unknown,
            latencyMs,
            inputTokens: usage?.promptTokenCount ?? null,
            outputTokens: usage?.candidatesTokenCount ?? null,
            imageUrls: ctx?.imageUrls ?? null,
        });

        return normalised;
    } catch (e) {
        console.error('[agent-critique] generateContent threw', e);
        logPipelineStep({
            stepName: 'agent-critique',
            status: 'error',
            durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId,
            userId: ctx?.userId,
            modelName: GEMINI_CRITIQUE_MODEL_NAME,
            errorMessage: e instanceof Error ? e.message : String(e),
        });
        return null;
    }
}

// ── runCritique adapter (Phase 2 spec signature) ───────────────────────────────
//
// Convenience wrapper around `runDiagnosisCritique` that takes the raw agent
// outputs (classification + prose) and builds the `AgentOutputsSummary` the
// runner expects. This is the entrypoint the `/api/diagnose` and
// `/api/diagnoses/[id]/refine` routes call as fire-and-forget. It honours both
// `DIAGNOSIS_AGENT_3_ENABLED` (spec name) and `DIAGNOSIS_AGENT_CRITIQUE_ENABLED`
// (existing name) so toggling either flag turns the critique on. Never throws.
//
// Source plan: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 2.

export interface RunCritiqueAdapterParams {
    contents: GeminiContent[];
    classification: ClassificationResult;
    prose: ProseResult;
    reasoning?: DiagnosticReasoning | null;
    conversationId?: string | null;
    userId?: string | null;
    /** Round 1 for /diagnose, ≥2 for /refine. Defaults to 1. */
    round?: number;
    /** Optional outcome override. When omitted, derived from classification flags. */
    outcome?: DiagnosisOutcome;
    ctx?: { imageUrls?: string[] | null };
}

function deriveOutcome(classification: ClassificationResult): DiagnosisOutcome {
    if (classification.rejected) return 'rejected';
    if (classification.unserviced) return 'unserviced';
    if (classification.requires_clarification) return 'requires_clarification';
    return 'committed';
}

function summariseClassification(
    classification: ClassificationResult,
): AgentOutputsSummary['classification'] {
    return {
        trade: classification.trade,
        trade_detail: classification.trade_detail,
        subcategory_id: classification.subcategory_id,
        confidence: classification.confidence,
        rejected: classification.rejected,
        requires_clarification: classification.requires_clarification,
        unserviced: classification.unserviced,
        failed_component: classification.failed_component,
        cascading_damage: classification.cascading_damage,
    };
}

function summariseProse(prose: ProseResult): AgentOutputsSummary['prose'] {
    return {
        thought: prose.thought,
        diagnosis: prose.diagnosis,
        message: prose.message,
        action_required: prose.action_required,
    };
}

/**
 * Phase 2 spec-aligned critique entrypoint. Fire-and-forget. Never throws.
 *
 * Returns the structured critique on success, or null when:
 *   - The env flag is off (both `DIAGNOSIS_AGENT_3_ENABLED` and
 *     `DIAGNOSIS_AGENT_CRITIQUE_ENABLED` must be unset/!= '1' to skip).
 *   - The underlying Gemini call fails, the JSON parse fails, or
 *     normalisation fails (logged via `logPipelineStep`).
 */
export async function runCritique(
    params: RunCritiqueAdapterParams,
): Promise<DiagnosisCritique | null> {
    const enabled =
        process.env.DIAGNOSIS_AGENT_3_ENABLED === '1' ||
        process.env.DIAGNOSIS_AGENT_CRITIQUE_ENABLED === '1';
    if (!enabled) return null;

    try {
        return await runDiagnosisCritique({
            contents: params.contents,
            agentOutputs: {
                classification: summariseClassification(params.classification),
                prose: summariseProse(params.prose),
                reasoning: params.reasoning ?? null,
            },
            outcome: params.outcome ?? deriveOutcome(params.classification),
            round: params.round ?? 1,
            ctx: {
                userId: params.userId ?? null,
                conversationId: params.conversationId ?? null,
                imageUrls: params.ctx?.imageUrls ?? null,
            },
        });
    } catch (e) {
        // Belt-and-braces: runDiagnosisCritique already swallows errors, but
        // we never want the fire-and-forget tail to bubble out of this adapter.
        console.warn(
            JSON.stringify({
                type: 'agent-critique:adapter-failed',
                err: e instanceof Error ? e.message : String(e),
            }),
        );
        return null;
    }
}
