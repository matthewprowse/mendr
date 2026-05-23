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

import type { Content as GeminiContent } from '@google/generative-ai';
import { getDiagnosisModel } from '@/lib/ai/ai-diagnosis-backend';
import { runClassification } from '@/features/diagnosis/agent-classify';
import { runProseGeneration, normaliseProse } from '@/features/diagnosis/agent-prose';
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
}

export interface PipelineEmitter {
    emitThought(text: string): void;
    emitComplete(full: string): void;
}

export interface StreamingResponseBuilderParams {
    pipelineCommon: RunPipelineParams;
    hasQuickThought: boolean;
    quotaExtraHeaders: Record<string, string>;
    responseMetaHeaders: Record<string, string>;
    onSuccess: () => void;
}

/**
 * Wrap `runDiagnosePipelineStreaming` in the NDJSON ReadableStream + headers
 * boilerplate the route returns. Extracted to keep the route handler thin.
 */
export function buildStreamingNDJSONResponse(
    params: StreamingResponseBuilderParams,
): Response {
    const { pipelineCommon, hasQuickThought, quotaExtraHeaders, responseMetaHeaders, onSuccess } =
        params;
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
 * Run the non-streaming pipeline. Returns the final response body string.
 */
export async function runDiagnosePipelineNonStreaming(
    params: RunPipelineParams,
): Promise<string> {
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
    } = params;

    const classification = await runClassification(
        contents as unknown as GeminiContent[],
        serviceListText,
        serviceList,
    );
    recordStage(timings, 'agent2a_classify_ms', pipelineStartedAt);

    const rawProse = await runProseGeneration({
        contents: contents as unknown as GeminiContent[],
        classification,
        baseSystemInstruction: proseBaseInstruction,
        isProviderHydration,
        imageCount: imagesAfterTier,
    });
    const prose = normaliseProse(rawProse);
    recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

    return buildCompatibleResponseText({
        ...responseShape,
        thoughtText: prose.thought,
        classification,
        prose,
        serviceList,
    });
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
    } = params;

    let streamedThought = '';

    if (hasQuickThought) {
        const quickModel = getDiagnosisModel();
        const [, classification] = await Promise.all([
            (async () => {
                try {
                    const quickStream = await quickModel.generateContentStream({
                        contents: quickThoughtContents as unknown as GeminiContent[],
                        generationConfig: {
                            temperature: 0.2,
                            topP: 0.7,
                            topK: 20,
                            maxOutputTokens: 220,
                        },
                    });
                    let accum = '';
                    let lastInner = '';
                    for await (const chunk of quickStream.stream) {
                        const piece = chunk.text();
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
            ),
        ]);
        recordStage(timings, 'agent2a_classify_ms', pipelineStartedAt);

        const rawProse = await runProseGeneration({
            contents: contents as unknown as GeminiContent[],
            classification,
            baseSystemInstruction: proseBaseInstruction,
            isProviderHydration,
            imageCount: imagesAfterTier,
        });
        const prose = normaliseProse(rawProse);
        recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

        const full = buildCompatibleResponseText({
            ...responseShape,
            thoughtText: streamedThought || prose.thought,
            classification,
            prose,
            serviceList,
        });
        emitter.emitComplete(full);
        return;
    }

    // Sequential 2a → 2b path (text-only or non-streaming-thought image branch).
    const classification = await runClassification(
        contents as unknown as GeminiContent[],
        serviceListText,
        serviceList,
    );
    recordStage(timings, 'agent2a_classify_ms', pipelineStartedAt);

    const rawProse = await runProseGeneration({
        contents: contents as unknown as GeminiContent[],
        classification,
        baseSystemInstruction: proseBaseInstruction,
        isProviderHydration,
        imageCount: imagesAfterTier,
    });
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
    emitter.emitComplete(full);
}
