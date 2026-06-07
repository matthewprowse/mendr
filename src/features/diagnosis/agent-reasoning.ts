/**
 * Agent 2c — Diagnostic Reasoning sub-agent.
 *
 * Runs only when requires_clarification=true and DIAGNOSIS_AGENT_2C_ENABLED=1.
 * Enumerates the hypotheses the system is weighing, identifies the single
 * observation that would discriminate between them, and produces 3–4
 * homeowner-tappable chips — each a structured hypothesis-update payload.
 *
 * The chips are derived from the specific photos and description submitted,
 * never from static trade templates. The reasoning pattern (enumerate →
 * discriminate → ask) is domain-agnostic; trade-specific knowledge lives
 * entirely in the model's general world knowledge.
 */

import { Type } from '@google/genai';
import type { Content as GeminiContent } from '@google/genai';
import {
    getDiagnosisModel,
    getDiagnosisModelByName,
    GEMINI_MODEL_NAME,
} from '@/lib/ai/ai-diagnosis-backend';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
import { logAiCall, textifyGeminiContents } from '@/lib/ai/ai-call-logger';
import { logPipelineStep } from '@/lib/ai/ai-logging';
import { DIAGNOSE_PROMPT_VERSION } from '@/features/diagnosis/prompts/prompt-version';
import type { DiagnosticReasoning } from '@/features/diagnosis/types';
import {
    resolveVariant,
    getReasoningSystemPrompt,
    getReasoningSamplingParams,
    type PromptVariant,
} from '@/features/diagnosis/prompts/variants/prompt-variant';

export type { DiagnosticReasoning };

// ── Schema ─────────────────────────────────────────────────────────────────────

const REASONING_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        hypotheses: {
            type: Type.ARRAY,
            description: 'The 2–4 fault hypotheses you are weighing. Order by confidence_alone descending.',
            items: {
                type: Type.OBJECT,
                properties: {
                    id: {
                        type: Type.STRING,
                        description: 'Stable id within this turn, e.g. "h1", "h2".',
                    },
                    label: {
                        type: Type.STRING,
                        description: 'Short, homeowner-readable fault name. Max 6 words. E.g. "Broken torsion spring".',
                    },
                    confidence_alone: {
                        type: Type.NUMBER,
                        description: 'Float 0–1. What the confidence would be IF this hypothesis is confirmed.',
                    },
                    evidence_for: {
                        type: Type.ARRAY,
                        description: '1–3 short phrases citing visible evidence from the photos or description.',
                        items: { type: Type.STRING },
                    },
                    evidence_against: {
                        type: Type.ARRAY,
                        description: '1–3 short phrases. Empty array if no contradicting evidence.',
                        items: { type: Type.STRING },
                    },
                    visual_anchor_image_index: {
                        type: Type.INTEGER,
                        description: '0-based index of the photo that most supports this hypothesis. Omit if no specific photo.',
                    },
                },
                required: ['id', 'label', 'confidence_alone', 'evidence_for', 'evidence_against'],
            },
        },
        what_we_dont_know: {
            type: Type.STRING,
            description: '1–2 sentences in plain English. The specific gap in evidence that prevents committing to a diagnosis.',
        },
        why_it_matters: {
            type: Type.STRING,
            description: '1–2 sentences. Why this question is the right one to ask now — ties the question to discrimination between hypotheses.',
        },
        chips: {
            type: Type.ARRAY,
            description: '3–4 homeowner-tappable chips. Each is a hypothesis-update payload. The last chip should always be "Something else is happening."',
            items: {
                type: Type.OBJECT,
                properties: {
                    id: {
                        type: Type.STRING,
                        description: 'Stable id within this turn, e.g. "c1", "c2".',
                    },
                    text: {
                        type: Type.STRING,
                        description: 'The chip label. Max 8 words, homeowner-readable. Start with a capital letter.',
                    },
                    supports: {
                        type: Type.STRING,
                        description: 'Hypothesis id (e.g. "h1") that selecting this chip would CONFIRM. Use empty string for "Something else" or when ambiguous.',
                    },
                    rules_out: {
                        type: Type.ARRAY,
                        description: 'Hypothesis ids that selecting this chip would RULE OUT. Empty array if none.',
                        items: { type: Type.STRING },
                    },
                },
                required: ['id', 'text', 'supports', 'rules_out'],
            },
        },
        round: {
            type: Type.INTEGER,
            description: '1 for first clarification round, 2 for second.',
        },
        next_step_if_unresolved: {
            type: Type.STRING,
            description: '"ask_again" if a second discriminating question exists, "commit_low_confidence" if this is the last useful question you can ask.',
        },
    },
    required: [
        'hypotheses',
        'what_we_dont_know',
        'why_it_matters',
        'chips',
        'round',
        'next_step_if_unresolved',
    ],
};

// ── System prompt ──────────────────────────────────────────────────────────────

// Exported for prompt-variant resolver (re-exported as `_v25` from
// `prompts/variants/v2_5-builders.ts`). The variant resolver decides whether
// to call this v2.5 baseline or a future v3.5 sibling.
export function buildReasoningSystemPrompt(round: 1 | 2, priorContext?: string): string {
    const roundNote =
        round === 2
            ? `\n\nIMPORTANT — ROUND 2: The homeowner has already answered one question. You must NOT re-ask the same discriminator. If the surviving hypotheses cannot be distinguished by any new observation, return chips: [] and next_step_if_unresolved: "commit_low_confidence".`
            : '';

    const priorBlock = priorContext
        ? `\n\nHYPOTHESIS STATE FROM ROUND 1:\n${priorContext}`
        : '';

    return `You are a diagnostic reasoning engine for Mendr, a South African home services AI. Your job is to identify what the system does not yet know — and ask the single question that would resolve it.

REASONING PATTERN (follow in order):
1. Look at all the photos and the homeowner's description.
2. List the 2–4 most plausible faults you would consider if you were the on-site tradesperson. Use your general knowledge of the specific trade — not generic templates.
3. For each fault, write down the visible evidence FOR it and AGAINST it, citing specific details from the photos or description.
4. Identify the pair of hypotheses that are hardest to distinguish from the current evidence.
5. Ask yourself: what single observation — something the homeowner can check right now without tools — would tell me which hypothesis is correct?
6. Phrase that observation as 3–4 homeowner-tappable chips. The last chip must always offer an escape: "Something else is happening."

PRINCIPLES:
- Every chip must be derived from the specific case. No generic or trade-template chips.
- Each chip must semantically confirm or rule out at least one hypothesis. If a chip would not move the hypothesis tree, remove it.
- The question must be something the homeowner can answer from where they are — not "call a plumber" or "check the manual".
- what_we_dont_know: name the specific gap, not a general statement about complexity.
- why_it_matters: explain how the homeowner's answer will change the diagnosis, not why diagnosis is hard.${roundNote}${priorBlock}`.trim();
}

// ── Output validation ──────────────────────────────────────────────────────────

function normaliseReasoning(raw: unknown): DiagnosticReasoning | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;

    const hypotheses = Array.isArray(r.hypotheses)
        ? r.hypotheses
              .filter(
                  (h): h is Record<string, unknown> =>
                      typeof h === 'object' && h !== null,
              )
              .map((h, i) => ({
                  id: typeof h.id === 'string' && h.id.trim() ? h.id.trim() : `h${i + 1}`,
                  label: typeof h.label === 'string' ? h.label.trim() : `Hypothesis ${i + 1}`,
                  confidence_alone:
                      typeof h.confidence_alone === 'number'
                          ? Math.max(0, Math.min(1, h.confidence_alone))
                          : 0.5,
                  evidence_for: Array.isArray(h.evidence_for)
                      ? (h.evidence_for as unknown[])
                            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                      : [],
                  evidence_against: Array.isArray(h.evidence_against)
                      ? (h.evidence_against as unknown[])
                            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                      : [],
                  ...(typeof h.visual_anchor_image_index === 'number'
                      ? { visual_anchor_image_index: Math.max(0, Math.floor(h.visual_anchor_image_index)) }
                      : {}),
              }))
        : [];

    if (hypotheses.length < 2) return null;

    const chips = Array.isArray(r.chips)
        ? r.chips
              .filter(
                  (c): c is Record<string, unknown> =>
                      typeof c === 'object' && c !== null,
              )
              .map((c, i) => ({
                  id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `c${i + 1}`,
                  text:
                      typeof c.text === 'string' && c.text.trim()
                          ? c.text.trim()
                          : 'Something else is happening.',
                  supports:
                      typeof c.supports === 'string' && c.supports.trim()
                          ? c.supports.trim()
                          : null,
                  rules_out: Array.isArray(c.rules_out)
                      ? (c.rules_out as unknown[]).filter(
                            (s): s is string => typeof s === 'string' && s.trim().length > 0,
                        )
                      : [],
              }))
        : [];

    const rawRound = r.round;
    const round: 1 | 2 = rawRound === 2 ? 2 : 1;

    const rawNext = r.next_step_if_unresolved;
    const next_step_if_unresolved: 'ask_again' | 'commit_low_confidence' =
        rawNext === 'commit_low_confidence' ? 'commit_low_confidence' : 'ask_again';

    return {
        hypotheses,
        what_we_dont_know:
            typeof r.what_we_dont_know === 'string' ? r.what_we_dont_know.trim() : '',
        why_it_matters:
            typeof r.why_it_matters === 'string' ? r.why_it_matters.trim() : '',
        chips,
        round,
        next_step_if_unresolved,
    };
}

// ── Runner ─────────────────────────────────────────────────────────────────────

export interface RunReasoningParams {
    contents: GeminiContent[];
    round?: 1 | 2;
    priorContext?: string;
    ctx?: {
        userId?: string | null;
        conversationId?: string | null;
        imageUrls?: string[] | null;
        promptVariant?: PromptVariant | null;
        modelOverride?: string | null;
        /**
         * Classifier output forwarded from the caller — used by the
         * high-confidence gate (cost-cut Deliverable 3). When the classifier
         * is highly confident AND not asking for clarification, the chips
         * Agent 2c would produce will never be shown to the user, so running
         * this agent is wasted spend.
         *
         * Both fields are optional for backwards compatibility — when omitted,
         * the gate is inert and the agent runs as before.
         */
        classifierConfidence?: number | null;
        requiresClarification?: boolean | null;
    };
}

export async function runDiagnosticReasoning({
    contents,
    round = 1,
    priorContext,
    ctx,
}: RunReasoningParams): Promise<DiagnosticReasoning | null> {
    const stepStart = Date.now();
    const effectiveModel = ctx?.modelOverride || GEMINI_MODEL_NAME;
    const variant = resolveVariant({
        override: ctx?.promptVariant,
        model: effectiveModel,
    });
    const variantCtx = { variant };

    // ── High-confidence skip gate (cost-cut Deliverable 3) ────────────────
    // Agent 2c produces structured hypothesis chips for the clarification UI.
    // When the classifier is highly confident (≥85) AND not asking for
    // clarification, the model will commit anyway and the chips never reach
    // the user. Skip the call entirely and return null — the response-builder
    // already handles null gracefully.
    //
    // Gate only fires when BOTH classifier fields are supplied by the caller;
    // legacy callers that don't pass them keep the existing always-run
    // behaviour (safe default — no silent regression on the refine path).
    const classifierConfidence = ctx?.classifierConfidence;
    const requiresClarification = ctx?.requiresClarification;
    if (
        typeof classifierConfidence === 'number' &&
        classifierConfidence >= 85 &&
        requiresClarification !== true
    ) {
        console.warn(
            JSON.stringify({
                event: 'agent_2c_skipped',
                reason: 'high_confidence',
                classifierConfidence,
            }),
        );
        logPipelineStep({
            stepName: 'agent-reasoning',
            status: 'ok',
            durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId,
            userId: ctx?.userId,
            modelName: effectiveModel,
            meta: { skipped: true, reason: 'high_confidence' },
        });
        return null;
    }

    if (process.env.MOCK_LLM === '1') {
        logPipelineStep({
            stepName: 'agent-reasoning',
            status: 'ok',
            durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId,
            userId: ctx?.userId,
            modelName: 'mock-llm',
        });
        return {
            hypotheses: [
                {
                    id: 'h1',
                    label: 'Broken torsion spring',
                    confidence_alone: 0.8,
                    evidence_for: ['Visible spring asymmetry in photo'],
                    evidence_against: [],
                },
                {
                    id: 'h2',
                    label: 'Snapped cable',
                    confidence_alone: 0.6,
                    evidence_for: ['Cable slack visible on one side'],
                    evidence_against: ['Spring appears intact'],
                },
            ],
            what_we_dont_know: 'We cannot tell from the photos whether the door moves at all.',
            why_it_matters: 'If the door cannot move, it points to a spring or cable failure rather than a motor issue.',
            chips: [
                { id: 'c1', text: 'The door does not move at all.', supports: 'h1', rules_out: ['h2'] },
                { id: 'c2', text: 'The door moves a little but gets stuck.', supports: 'h2', rules_out: ['h1'] },
                { id: 'c3', text: 'Something else is happening.', supports: null, rules_out: [] },
            ],
            round,
            next_step_if_unresolved: 'commit_low_confidence',
        };
    }

    try {
        const model = getDiagnosisModelByName(ctx?.modelOverride);
        const systemPrompt = getReasoningSystemPrompt(round, priorContext, variantCtx);
        const sampling = getReasoningSamplingParams(variantCtx);

        const reasoningContents: GeminiContent[] = [
            ...contents,
            {
                role: 'user' as const,
                parts: [
                    {
                        text: 'DIAGNOSTIC REASONING TASK — apply the reasoning pattern above and return ONLY one JSON object matching the schema. Derive every hypothesis and chip from the specific photos and description above. Do not use generic trade templates.',
                    },
                ],
            },
        ];

        const callStart = Date.now();
        const result = await model.client.models.generateContent({
            model: model.model,
            contents: reasoningContents,
            config: {
                ...sampling,
                responseMimeType: 'application/json',
                responseSchema: REASONING_SCHEMA,
                systemInstruction: systemPrompt,
            },
        });
        const latencyMs = Date.now() - callStart;

        const usage = result.usageMetadata;
        void logGeminiUsage(usage, {
            endpoint: 'diagnose/reasoning',
            modelName: effectiveModel,
            userId: ctx?.userId,
            conversationId: ctx?.conversationId,
            latencyMs,
        });

        const raw = (result.text ?? '').trim();
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            console.error('[agent-reasoning] JSON parse failed', raw.slice(0, 400));
            logPipelineStep({
                stepName: 'agent-reasoning',
                status: 'error',
                durationMs: Date.now() - stepStart,
                conversationId: ctx?.conversationId,
                userId: ctx?.userId,
                modelName: effectiveModel,
                errorMessage: 'JSON parse failed',
            });
            return null;
        }

        const normalised = normaliseReasoning(parsed);
        if (!normalised) {
            console.error('[agent-reasoning] normalisation failed — insufficient hypotheses or chips');
            logPipelineStep({
                stepName: 'agent-reasoning',
                status: 'error',
                durationMs: Date.now() - stepStart,
                conversationId: ctx?.conversationId,
                userId: ctx?.userId,
                modelName: effectiveModel,
                errorMessage: 'normalisation failed',
            });
            return null;
        }

        logPipelineStep({
            stepName: 'agent-reasoning',
            status: 'ok',
            durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId,
            userId: ctx?.userId,
            modelName: effectiveModel,
            promptTokens: usage?.promptTokenCount,
            completionTokens: usage?.candidatesTokenCount,
        });

        // Phase 3: full prompt + response logging — scheduled via after()
        logAiCall({
            conversationId: ctx?.conversationId,
            agentId: '2c',
            promptText: textifyGeminiContents(systemPrompt, reasoningContents),
            promptVersion: DIAGNOSE_PROMPT_VERSION,
            modelId: effectiveModel,
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
        console.error('[agent-reasoning] generateContent threw', e);
        logPipelineStep({
            stepName: 'agent-reasoning',
            status: 'error',
            durationMs: Date.now() - stepStart,
            conversationId: ctx?.conversationId,
            userId: ctx?.userId,
            modelName: effectiveModel,
            errorMessage: e instanceof Error ? e.message : String(e),
        });
        return null;
    }
}
