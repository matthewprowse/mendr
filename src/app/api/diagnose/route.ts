// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GEMINI_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

export const maxDuration = 60;

import { NextRequest } from 'next/server';
import { logAiEvent } from '@/lib/ai/ai-logging';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { getServiceCatalogLabelsCached } from '@/lib/service-catalog-server';
import { normalizeProvidersForPrompt } from '@/lib/diagnosis/diagnose-prompt-providers';
import {
    buildSystemInstruction,
    buildProseBaseInstruction,
} from '@/features/diagnosis/prompts/composer';
import { buildProviderHydrationPromptBlock } from '@/features/diagnosis/prompts/provider-hydration';
import { buildStreamingQuickThoughtPrompt } from '@/features/diagnosis/prompts/user-turn';
import { SERVICE_LABELS } from '@/lib/services';
import {
    DIAGNOSE_RESPONSE_META_HEADERS,
    buildDiagnoseErrorResponse,
    buildDiagnoseSuccessMeta,
    diagnoseAiLogMeta,
    extractErrorMessage,
    logDiagnoseTimings,
    recordStage,
} from './helpers';
import { checkDiagnosisQuota } from './quota';
import { handleImageThoughtOnly } from './quick-thought';
import {
    buildDiagnoseContents,
    type ContentMessage,
    type ContentPart,
} from './contents-builder';
import {
    buildStreamingNDJSONResponse,
    runDiagnosePipelineNonStreaming,
} from './pipeline-runner';
import { parseDiagnoseRequest } from './request-parser';

export async function POST(req: NextRequest) {
    const timings: Record<string, number> = {};
    const requestStartedAt = Date.now();

    // ── Rate limit (must be first) ──────────────────────────────────────────────
    const rateLimitStageStartedAt = Date.now();
    const limited = await checkRateLimit(req, 'diagnose');
    recordStage(timings, 'rate_limit_check_ms', rateLimitStageStartedAt);
    if (limited) return limited;

    // ── Diagnosis quota ─────────────────────────────────────────────────────────
    // Peek the body for history length / analysisPhase so we can decide whether
    // to consume quota. The body will be re-parsed below for the main flow.
    let parsedBodyForQuota: Record<string, unknown> | null = null;
    try {
        const cloned = req.clone();
        parsedBodyForQuota = await cloned.json();
    } catch {
        // Non-fatal — body will be re-parsed below
    }

    const quotaStageStartedAt = Date.now();
    const { blockingResponse: quotaBlock, extraHeaders: quotaExtraHeaders } =
        await checkDiagnosisQuota({ req, body: parsedBodyForQuota });
    recordStage(timings, 'quota_check_ms', quotaStageStartedAt);
    if (quotaBlock) return quotaBlock;

    const startedAt = Date.now();
    try {
        const parseStageStartedAt = Date.now();
        const rawBody = await req.json();
        recordStage(timings, 'parse_request_body_ms', parseStageStartedAt);

        const parseResult = parseDiagnoseRequest(rawBody);
        if (parseResult.kind === 'response') return parseResult.response;
        const parsed = parseResult.parsed;
        const {
            textQuery,
            history,
            feedback,
            providers,
            previousDiagnosis,
            diagnosisRejected,
            userSelectedTrade,
            initialImageDescription,
            serviceCatalog,
            analysisPhase,
            wantsStream,
            image,
            attachmentImages,
            hasAttachments,
            isTextOnly,
            isProviderHydration,
            isFollowUp,
            hasUserContext,
            prevDiagForHydration,
        } = parsed;

        // eslint-disable-next-line no-console
        console.warn(
            JSON.stringify({
                type: 'ai_request',
                endpoint: 'diagnose',
                hasImage: Boolean(image),
                hasText: Boolean(textQuery),
                attachmentsCount: attachmentImages.length,
                historyLength: Array.isArray(history) ? history.length : 0,
            }),
        );

        const normalizedProviders = normalizeProvidersForPrompt(providers) ?? [];
        const providersForPrompt =
            normalizedProviders.length > 0 ? normalizedProviders : undefined;

        // ── Lightweight warm-up: image_thought_only ────────────────────────────
        if (analysisPhase === 'image_thought_only') {
            return handleImageThoughtOnly({
                image,
                attachmentImages,
                wantsStream,
                quotaExtraHeaders,
            });
        }

        // ── Service catalog ─────────────────────────────────────────────────────
        let serviceList = Array.isArray(serviceCatalog)
            ? serviceCatalog
                  .filter((x: unknown) => typeof x === 'string' && x.trim())
                  .map((x: string) => x.trim())
            : [];
        if (serviceList.length === 0) {
            const serviceCatalogStageStartedAt = Date.now();
            serviceList = await getServiceCatalogLabelsCached();
            recordStage(timings, 'service_catalog_cache_or_db_ms', serviceCatalogStageStartedAt);
        }
        if (serviceList.length === 0) {
            console.warn(
                '[diagnose] service catalog empty after cache/db fetch — using SERVICE_LABELS fallback',
            );
            serviceList = [...SERVICE_LABELS];
        }
        const serviceListText = serviceList.join(', ');
        const promptContext = {
            isFollowUp,
            hasUserContext: Boolean(hasUserContext),
            userSelectedTrade: hasUserContext
                ? {
                      diagnosis: String(userSelectedTrade.diagnosis),
                      trade: String(userSelectedTrade.trade),
                  }
                : null,
            isTextOnlyNoAttachments: isTextOnly && !hasAttachments,
            serviceListText,
            feedback,
            providers: providersForPrompt,
            previousDiagnosis: prevDiagForHydration ?? previousDiagnosis,
            diagnosisRejected,
        };
        const systemInstruction = buildSystemInstruction(promptContext);
        const proseBaseInstruction = buildProseBaseInstruction(promptContext);

        const userOriginalWordsHydration = (
            typeof textQuery === 'string' ? textQuery : ''
        ).trim();
        const hydrationAppendix = isProviderHydration
            ? `\n\n${buildProviderHydrationPromptBlock(userOriginalWordsHydration)}`
            : '';
        const instructionPrefix = `${systemInstruction.trim()}${hydrationAppendix}\n\n`;

        // ── Build Gemini contents ───────────────────────────────────────────────
        const { contents, imagesInRequest, imagesAfterTier } = await buildDiagnoseContents({
            image,
            attachmentImages,
            textQuery,
            history,
            initialImageDescription,
            instructionPrefix,
            isTextOnly,
            isProviderHydration,
            hasUserContext: Boolean(hasUserContext),
            userSelectedTrade,
        });

        const tieringLogMeta: Record<string, unknown> = {
            imagesInRequest,
            imagesAfterTier,
            imageTierMs: null as number | null,
            tierMultiIssue: false,
            tierFallback: false,
        };

        // ── Multi-agent pipeline ────────────────────────────────────────────────
        const pipelineStartedAt = Date.now();

        // Quick-thought parallel stream contents (image branch only when streaming).
        const quickThoughtContents: ContentMessage[] = isTextOnly
            ? []
            : (() => {
                  const imageParts2: ContentPart[] = [];
                  const firstUserTurn = contents.find((c) => c.role === 'user');
                  if (firstUserTurn) {
                      for (const p of firstUserTurn.parts) {
                          if ((p as ContentPart).inlineData) imageParts2.push(p as ContentPart);
                      }
                  }
                  return imageParts2.length > 0
                      ? [
                            {
                                role: 'user' as const,
                                parts: [
                                    ...imageParts2,
                                    { text: buildStreamingQuickThoughtPrompt() },
                                ],
                            } as ContentMessage,
                        ]
                      : [];
              })();

        const hasQuickThought = quickThoughtContents.length > 0 && wantsStream;

        const responseShape = {
            previousDiagnosis,
            diagnosisRejected,
            history,
            initialImageDescription,
            textQuery,
            imageCountAfterTier: imagesAfterTier,
            hasImage: Boolean(image),
            attachmentCount: attachmentImages.length,
        };
        const pipelineCommon = {
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
        };

        const logSuccess = (ndjsonStream: boolean) => {
            const durationMs = Date.now() - startedAt;
            recordStage(timings, 'total_request_ms', requestStartedAt);
            logAiEvent({
                endpoint: 'diagnose',
                status: 'ok',
                durationMs,
                meta: buildDiagnoseSuccessMeta({
                    isTextOnly,
                    isFollowUp,
                    hasUserContext,
                    hasImage: Boolean(image),
                    attachmentCount: attachmentImages.length,
                    historyLength: Array.isArray(history) ? history.length : 0,
                    pipeline: 'v2-classify-prose',
                    ...(ndjsonStream ? { ndjsonStream: true } : {}),
                    tieringLogMeta,
                }),
            });
            logDiagnoseTimings('ok', timings);
        };

        if (wantsStream) {
            return buildStreamingNDJSONResponse({
                pipelineCommon,
                hasQuickThought,
                quotaExtraHeaders,
                responseMetaHeaders: DIAGNOSE_RESPONSE_META_HEADERS,
                onSuccess: () => logSuccess(true),
            });
        }

        const full = await runDiagnosePipelineNonStreaming(pipelineCommon);
        logSuccess(false);
        return new Response(full, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                ...DIAGNOSE_RESPONSE_META_HEADERS,
                ...quotaExtraHeaders,
            },
        });
    } catch (error: unknown) {
        const durationMs = Date.now() - startedAt;
        recordStage(timings, 'total_request_ms', requestStartedAt);
        logAiEvent({
            endpoint: 'diagnose',
            status: 'error',
            durationMs,
            meta: diagnoseAiLogMeta({ error: extractErrorMessage(error) }),
        });
        console.error('Gemini Diagnosis Error:', error);
        logDiagnoseTimings('error', timings);
        return buildDiagnoseErrorResponse(error);
    }
}
