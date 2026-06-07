/**
 * Multi-agent pipeline orchestrator for /api/diagnose.
 *
 * Extracted in Phase 2 from `route.ts`. Coordinates Agent 2a (classify) and
 * Agent 2b (prose) plus the optional parallel quick-thought stream. Returns
 * either the final response string (non-streaming) or a callback that drives
 * the NDJSON ReadableStream (streaming).
 *
 * Pipeline invariants (from CLAUDE.md — unchanged by this refactor):
 *   1. checkRateLimit  ← already handled before this runs
 *   2. incrementDiagnosisQuota ← already handled before this runs
 *   3. runClassification (Agent 2a)
 *   4. runProseGeneration (Agent 2b)
 *   5. logGeminiUsage (inside agents — fire-and-forget)
 *   6. logPipelineStep (inside agents)
 */

import type { Content as GeminiContent } from '@google/genai';
import { getDiagnosisModel } from '@/lib/ai/ai-diagnosis-backend';
import { runClassification, type ClassificationResult } from '@/features/diagnosis/agent-classify';
import {
    runProseGeneration,
    normaliseProse,
    ProseGenerationError,
    buildSoftFallbackProse,
    type ProseResult,
} from '@/features/diagnosis/agent-prose';
import { stripFillerSentenceStarts } from '@/lib/ai/prompt-utils';
import {
    extractPartialThoughtInner,
    extractThoughtText,
    recordStage,
} from './helpers';
import {
    buildCompatibleResponseText,
    type BuildCompatibleResponseInput,
} from './response-builder';
import type { ContentMessage } from './contents-builder';
import type { PromptVariant } from '@/features/diagnosis/prompts/variants/prompt-variant';

export interface RunPipelineParams {
    contents: ContentMessage[];
    quickThoughtContents: ContentMessage[];
    serviceListText: string;
    serviceList: string[];
    proseBaseInstruction: string;
    isProviderHydration: boolean;
    imagesAfterTier: number;
    timings: Record<string, number>;
    pipelineStartedAt: number;
    /** All the trailing fields needed by buildCompatibleResponseText. */
    responseShape: Omit<
        BuildCompatibleResponseInput,
        'thoughtText' | 'classification' | 'prose' | 'serviceList'
    >;
    /** Per-request overrides forwarded from the parsed request body. */
    conversationId?: string | null;
    userId?: string | null;
    promptVariant?: PromptVariant | null;
    modelOverride?: string | null;
}

export interface PipelineEmitter {
    emitThought(text: string): void;
    emitComplete(full: string): void;
    /**
     * Fired after Agent 2a + Agent 2b complete but before the streaming
     * response closes. Lets the route handler kick off fire-and-forget
     * downstream work (Agent 3 critique). Optional; ignored when absent.
     * Wired here in v7.5 of the Hardening Plan so streaming diagnoses
     * also generate critique data — previously only the refine path did.
     */
    onAgentOutputs?: (result: {
        classification: Awaited<ReturnType<typeof runClassification>>;
        prose: Awaited<ReturnType<typeof runProseGeneration>>;
    }) => void;
}

export interface StreamingResponseBuilderParams {
    pipelineCommon: RunPipelineParams;
    hasQuickThought: boolean;
    quotaExtraHeaders: Record<string, string>;
    responseMetaHeaders: Record<string, string>;
    onSuccess: () => void;
    /**
     * Forwarded into the streaming pipeline's emitter as `onAgentOutputs`.
     * Lets the route handler trigger Agent 3 critique without holding open
     * the stream connection. The callback is invoked AFTER Agent 2a + 2b
     * complete, BEFORE the stream closes.
     */
    onAgentOutputs?: PipelineEmitter['onAgentOutputs'];
}

/**
 * Wrap `runDiagnosePipelineStreaming` in the NDJSON ReadableStream + headers
 * boilerplate the route returns. Extracted to keep the route handler thin.
 */
export function buildStreamingNDJSONResponse(
    params: StreamingResponseBuilderParams,
): Response {
    const {
        pipelineCommon,
        hasQuickThought,
        quotaExtraHeaders,
        responseMetaHeaders,
        onSuccess,
        onAgentOutputs,
    } = params;
    return new Response(
        new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const emit = (o: unknown) =>
                    controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));

                try {
                    await runDiagnosePipelineStreaming(
                        { ...pipelineCommon, hasQuickThought },
                        {
                            emitThought: (text) => emit({ type: 'thought', text }),
                            emitComplete: (full) => emit({ type: 'complete', full }),
                            onAgentOutputs,
                        },
                    );
                } catch (e) {
                    console.error('Multi-agent pipeline error:', e);
                    controller.error(e);
                    return;
                }

                onSuccess();
                controller.close();
            },
        }),
        {
            headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-store',
                ...responseMetaHeaders,
                ...quotaExtraHeaders,
            },
        },
    );
}

/**
 * Short-circuit prose generation (cost-cut Deliverable 4) when the classifier
 * has flagged `requires_clarification=true`. The full prose call would write
 * a verbose narrative that gets discarded once the user clarifies and the
 * refine round generates the real prose — running it is wasted spend.
 *
 * Returns a lightweight stub that carries `requires_clarification: true` and
 * empty narrative fields. The response-builder fills in the title from the
 * classification's subcategory taxonomy label, so the homeowner still sees a
 * sensible diagnosis-needs-info card.
 *
 * Gated by the SHORT_CIRCUIT_PROSE_ON_CLARIFY env var (default ON; opt-out
 * with `=0`). All four cost cuts are orthogonal — flipping this off does not
 * affect mixed-tier classify, prose caching, or the 2c skip gate.
 */
function shouldShortCircuitProseOnClarification(
    classification: ClassificationResult,
): boolean {
    if (process.env.SHORT_CIRCUIT_PROSE_ON_CLARIFY === '0') return false;
    return classification.requires_clarification === true;
}

function buildStubProseForClarification(): ProseResult {
    return {
        thought: 'Diagnosis requires more information from the homeowner.',
        // diagnosis is left blank — response-builder will fill it from
        // classification.subcategory_id taxonomy label.
        diagnosis: '',
        estimated_diagnosis_sentence: '',
        message: 'A few targeted questions will help confirm the exact fault.',
        action_required: '',
        image_descriptions: [],
        image_observations: [],
        clarification_questions: [],
        // structured_clarification stays undefined — populated by agent 2c
        // when it runs (refine path). The /diagnose entry call typically has
        // no 2c sidecar, so an empty stub is correct here.
        structured_clarification: undefined,
        contractor_checklist: [],
        homeowner_prep: '',
        diy_verification: '',
        photo_request: '',
        confidence_drivers: [],
        requires_clarification: true,
        requestFailed: false,
    };
}

/**
 * Run Agent 2b with structured error handling. As of v7.4 `runProseGeneration`
 * THROWS `ProseGenerationError` on parse / schema / short-thought failures
 * instead of silently substituting a generic apology. We catch that here and
 * surface a soft fallback (which logs `agent-prose:fallback-fired` so the
 * failure is always visible in production telemetry), keeping pipeline flow
 * intact while making the failure auditable rather than invisible.
 */
async function runProseWithFallback(args: Parameters<typeof runProseGeneration>[0]): Promise<{
    prose: Awaited<ReturnType<typeof runProseGeneration>>;
    failed: boolean;
}> {
    try {
        const result = await runProseGeneration(args);
        return { prose: result, failed: false };
    } catch (e) {
        if (e instanceof ProseGenerationError) {
            return {
                prose: buildSoftFallbackProse({ reason: e.kind, error: e }),
                failed: true,
            };
        }
        // Unknown error — let it bubble; the route handler will return 500.
        throw e;
    }
}

/**
 * Run the non-streaming pipeline. Returns the final response body string.
 */
/**
 * Result returned from the non-streaming pipeline. We now expose
 * classification + prose alongside the response string so the /api/diagnose
 * route can hand them to Agent 3 (self-critique) without re-running any
 * Gemini calls. Previously the function returned just `string`, which forced
 * the critique seam in route.ts to be a no-op (the comment block at
 * route.ts:295 documented this gap).
 */
export interface NonStreamingPipelineResult {
    /** Wrapped `<thought>…</thought><json>…</json>` body the client parses. */
    readonly responseText: string;
    /** Agent 2a output — passed to Agent 3 for critique calibration. */
    readonly classification: Awaited<ReturnType<typeof runClassification>>;
    /** Agent 2b output — passed to Agent 3 for critique calibration. */
    readonly prose: Awaited<ReturnType<typeof runProseGeneration>>;
}

export async function runDiagnosePipelineNonStreaming(
    params: RunPipelineParams,
): Promise<NonStreamingPipelineResult> {
    const {
        contents,
        serviceListText,
        serviceList,
        proseBaseInstruction,
        isProviderHydration,
        imagesAfterTier,
        timings,
        pipelineStartedAt,
        responseShape,
        conversationId,
        userId,
        promptVariant,
        modelOverride,
    } = params;
    const agentCtx = { conversationId, userId, promptVariant, modelOverride };

    const classification = await runClassification(
        contents as unknown as GeminiContent[],
        serviceListText,
        serviceList,
        agentCtx,
    );
    recordStage(timings, 'agent2a_classify_ms', pipelineStartedAt);

    let rawProse: ProseResult;
    if (shouldShortCircuitProseOnClarification(classification)) {
        console.warn(
            JSON.stringify({
                event: 'prose_short_circuited',
                reason: 'requires_clarification',
            }),
        );
        rawProse = buildStubProseForClarification();
    } else {
        ({ prose: rawProse } = await runProseWithFallback({
            contents: contents as unknown as GeminiContent[],
            classification,
            baseSystemInstruction: proseBaseInstruction,
            isProviderHydration,
            imageCount: imagesAfterTier,
            ctx: agentCtx,
        }));
    }
    const prose = normaliseProse(rawProse);
    recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

    const responseText = buildCompatibleResponseText({
        ...responseShape,
        thoughtText: prose.thought,
        classification,
        prose,
        serviceList,
    });

    return { responseText, classification, prose };
}

/**
 * Run the streaming pipeline. Calls the emitter for `thought` chunks and a
 * final `complete` envelope. When `hasQuickThought` is true, fires a parallel
 * quick-thought Gemini stream alongside Agent 2a.
 */
export async function runDiagnosePipelineStreaming(
    params: RunPipelineParams & { hasQuickThought: boolean },
    emitter: PipelineEmitter,
): Promise<void> {
    const {
        contents,
        quickThoughtContents,
        serviceListText,
        serviceList,
        proseBaseInstruction,
        isProviderHydration,
        imagesAfterTier,
        timings,
        pipelineStartedAt,
        responseShape,
        hasQuickThought,
        conversationId,
        userId,
        promptVariant,
        modelOverride,
    } = params;
    const agentCtx = { conversationId, userId, promptVariant, modelOverride };

    let streamedThought = '';

    if (hasQuickThought) {
        const quickModel = getDiagnosisModel();
        const [, classification] = await Promise.all([
            (async () => {
                try {
                    const quickStream = await quickModel.client.models.generateContentStream({
                        model: quickModel.model,
                        contents: quickThoughtContents as unknown as GeminiContent[],
                        config: {
                            temperature: 0.2,
                            topP: 0.7,
                            topK: 20,
                            maxOutputTokens: 220,
                        },
                    });
                    let accum = '';
                    let lastInner = '';
                    for await (const chunk of quickStream) {
                        const piece = chunk.text ?? '';
                        if (!piece) continue;
                        accum += piece;
                        const inner = extractPartialThoughtInner(accum);
                        if (inner !== null && inner !== lastInner) {
                            lastInner = inner;
                            emitter.emitThought(inner);
                        }
                    }
                    streamedThought = stripFillerSentenceStarts(
                        extractThoughtText(accum),
                    ).trim();
                } catch {
                    // Non-fatal: prose agent's thought used in complete
                }
            })(),
            runClassification(
                contents as unknown as GeminiContent[],
                serviceListText,
                serviceList,
                agentCtx,
            ),
        ]);
        recordStage(timings, 'agent2a_classify_ms', pipelineStartedAt);

        let rawProseStream: ProseResult;
        if (shouldShortCircuitProseOnClarification(classification)) {
            console.warn(
                JSON.stringify({
                    event: 'prose_short_circuited',
                    reason: 'requires_clarification',
                }),
            );
            rawProseStream = buildStubProseForClarification();
        } else {
            ({ prose: rawProseStream } = await runProseWithFallback({
                contents: contents as unknown as GeminiContent[],
                classification,
                baseSystemInstruction: proseBaseInstruction,
                isProviderHydration,
                imageCount: imagesAfterTier,
                ctx: agentCtx,
            }));
        }
        const prose = normaliseProse(rawProseStream);
        recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

        const full = buildCompatibleResponseText({
            ...responseShape,
            thoughtText: streamedThought || prose.thought,
            classification,
            prose,
            serviceList,
        });
        emitter.onAgentOutputs?.({ classification, prose });
        emitter.emitComplete(full);
        return;
    }

    // Sequential 2a → 2b path (text-only or non-streaming-thought image branch).
    const classification = await runClassification(
        contents as unknown as GeminiContent[],
        serviceListText,
        serviceList,
        agentCtx,
    );
    recordStage(timings, 'agent2a_classify_ms', pipelineStartedAt);

    let rawProse: ProseResult;
    if (shouldShortCircuitProseOnClarification(classification)) {
        console.warn(
            JSON.stringify({
                event: 'prose_short_circuited',
                reason: 'requires_clarification',
            }),
        );
        rawProse = buildStubProseForClarification();
    } else {
        ({ prose: rawProse } = await runProseWithFallback({
            contents: contents as unknown as GeminiContent[],
            classification,
            baseSystemInstruction: proseBaseInstruction,
            isProviderHydration,
            imageCount: imagesAfterTier,
            ctx: agentCtx,
        }));
    }
    const prose = normaliseProse(rawProse);
    recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

    if (prose.thought?.trim()) {
        emitter.emitThought(prose.thought.trim());
    }
    const full = buildCompatibleResponseText({
        ...responseShape,
        thoughtText: prose.thought,
        classification,
        prose,
        serviceList,
    });
    emitter.onAgentOutputs?.({ classification, prose });
    emitter.emitComplete(full);
}
