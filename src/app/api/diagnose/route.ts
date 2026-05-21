// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GEMINI_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

export const maxDuration = 60;

import { NextRequest } from 'next/server';
import type { Content as GeminiContent } from '@google/generative-ai';
import { GEMINI_MODEL_NAME, getDiagnosisModel } from '@/lib/ai/ai-diagnosis-backend';
import { logAiEvent } from '@/lib/ai/ai-logging';
import { logIfDiagnosisJsonShapeUnexpected } from '@/features/diagnosis/diagnosis-json-validate';
import { DIAGNOSE_PROMPT_VERSION } from '@/features/diagnosis/prompts/prompt-version';
import { checkRateLimit, isRateLimitBypassed } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getServiceCatalogLabelsCached } from '@/lib/service-catalog-server';
import { normalizeProvidersForPrompt } from '@/lib/diagnosis/diagnose-prompt-providers';
import { buildSystemInstruction, buildProseBaseInstruction } from '@/features/diagnosis/prompts/composer';
import { buildProviderHydrationPromptBlock } from '@/features/diagnosis/prompts/provider-hydration';
import {
    buildUnrelatedImageMessage,
    buildUnsupportedHomeServiceMessage,
} from '@/features/diagnosis/prompts/special-cases';
import {
    buildQuickThoughtPrompt,
    buildStreamingQuickThoughtPrompt,
    buildTextOnlyFirstMessagePrompt,
    buildImageFirstMessagePrompt,
    buildImageFollowUpPrompt,
    buildProviderHydrationImagePrompt,
} from '@/features/diagnosis/prompts/user-turn';
import { runClassification } from '@/features/diagnosis/agent-classify';
import { runProseGeneration, normaliseProse } from '@/features/diagnosis/agent-prose';
import { toHeadlineStyle, stripFillerSentenceStarts } from '@/lib/ai/prompt-utils';
import { inferTradeFromSignals, TAXONOMY_NONE_ID } from '@/lib/diagnosis/diagnosis-trade-taxonomy';
import { tradeToServiceLabel, SERVICE_LABELS } from '@/lib/services';

// Image URLs are fetched server-side — restrict to known-safe origins to prevent SSRF.
const ALLOWED_IMAGE_ORIGINS = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
].filter((s): s is string => typeof s === 'string' && s.length > 0);
const MAX_DIAGNOSE_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB guardrail — Gemini Flash prices images at a flat token rate, not by byte size.
/** Echoed on successful diagnosis responses for debugging; matches values embedded in <json>. */
const DIAGNOSE_RESPONSE_META_HEADERS: Record<string, string> = {
    'X-Scandio-Prompt-Version': DIAGNOSE_PROMPT_VERSION,
    'X-Scandio-Ai-Model': GEMINI_MODEL_NAME,
};

function diagnoseAiLogMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        promptVersion: DIAGNOSE_PROMPT_VERSION,
        model: GEMINI_MODEL_NAME,
        ...extra,
    };
}

function recordStage(timings: Record<string, number>, key: string, startedAt: number): void {
    timings[key] = Date.now() - startedAt;
}

function logDiagnoseTimings(status: 'ok' | 'error', timings: Record<string, number>): void {
    if (process.env.NODE_ENV !== 'development') return;
    // eslint-disable-next-line no-console
    console.warn(
        JSON.stringify({
            type: 'diagnose_timing',
            status,
            timings,
        })
    );
}

function isAllowedImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_IMAGE_ORIGINS.some(
            (origin) => parsed.origin === new URL(origin).origin,
        );
    } catch {
        return false;
    }
}


function extractThoughtText(responseText: string): string {
    const tagged =
        responseText.match(/<(?:thought|thinking|thought_process)\s*>([\s\S]*?)<\/(?:thought|thinking|thought_process)\s*>/i)?.[1] ??
        responseText.match(/```(?:thought|thinking)\s*([\s\S]*?)```/i)?.[1] ??
        '';
    if (tagged.trim()) return tagged.trim();
    const beforeJson = responseText.split(/<json\s*>|\{[\s\n]*"[^"]*"\s*:\s*"/i)[0] ?? '';
    return beforeJson.trim();
}

/** Best-effort inner text of the thought tag while the model is still streaming. */
function extractPartialThoughtInner(accum: string): string | null {
    const openRe = /<(?:thought|thinking|thought_process)\b[^>]*>/i;
    const openMatch = accum.match(openRe);
    if (!openMatch || openMatch.index === undefined) return null;
    const start = openMatch.index + openMatch[0].length;
    const rest = accum.slice(start);
    const closeMatch = rest.match(/<\/(?:thought|thinking|thought_process)\s*>/i);
    if (closeMatch && closeMatch.index !== undefined) {
        return rest.slice(0, closeMatch.index);
    }
    return rest;
}


export async function POST(req: NextRequest) {
    const timings: Record<string, number> = {};
    const requestStartedAt = Date.now();
    // ── Rate limit ─────────────────────────────────────────────────────────────
    const rateLimitStageStartedAt = Date.now();
    const limited = await checkRateLimit(req, 'diagnose');
    recordStage(timings, 'rate_limit_check_ms', rateLimitStageStartedAt);
    if (limited) return limited;

    // ── Diagnosis quota ─────────────────────────────────────────────────────────
    // Only count the FIRST message in a conversation (follow-ups are free).
    // Parse a peek of the body to check history length, then re-read below.
    const quotaExtraHeaders: Record<string, string> = {};
    let parsedBodyForQuota: Record<string, unknown> | null = null;
    try {
        // Clone the request so the body can be read again later
        const cloned = req.clone();
        parsedBodyForQuota = await cloned.json();
    } catch {
        // Non-fatal — body will be re-parsed below
    }

    const isFirstMessage =
        !parsedBodyForQuota?.history ||
        !Array.isArray(parsedBodyForQuota.history) ||
        (parsedBodyForQuota.history as unknown[]).length === 0;

    const disableDiagnosisQuota =
        process.env.DISABLE_DIAGNOSIS_DAILY_QUOTA === 'true' || isRateLimitBypassed(req);

    const skipQuotaIncrement =
        parsedBodyForQuota?.analysisPhase === 'image_thought_only';

    // Skip the full quota check (Supabase read + potential increment) for the
    // lightweight image_thought_only warm-up call — it never blocks users and
    // is fired fire-and-forget from the client orchestrator.
    if (isFirstMessage && !disableDiagnosisQuota && !skipQuotaIncrement) {
        const quotaStageStartedAt = Date.now();
        let quotaUserId: string | null = null;
        let quotaAnonKey: string | null = null;

        // Try to resolve authenticated user via cookie session
        try {
            const serverClient = await createSupabaseServerClient();
            const {
                data: { user },
            } = await serverClient.auth.getUser();
            if (user?.id) quotaUserId = user.id;
        } catch {
            // If SSR client fails, fall through to anonymous path
        }

        if (!quotaUserId) {
            const cookieHeader = req.headers.get('cookie') || '';
            const match = cookieHeader.match(/scandio_anon=([a-f0-9-]{36})/);
            quotaAnonKey = match?.[1] ?? null;
            if (!quotaAnonKey) {
                quotaAnonKey = crypto.randomUUID();
                quotaExtraHeaders['Set-Cookie'] =
                    `scandio_anon=${quotaAnonKey}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly`;
            }
        }

        const limit = quotaUserId ? 10 : 3;
        const today = new Date().toISOString().split('T')[0];

        try {
            const admin = await createSupabaseAdminClient();

            // Atomic increment via RPC — eliminates the read-then-write race condition.
            // Two simultaneous requests can no longer both pass by reading the same stale count.
            const { data: rpcData, error: rpcError } = await admin.rpc(
                'increment_diagnosis_quota',
                {
                    p_user_id: quotaUserId ?? null,
                    p_anon_key: quotaAnonKey ?? null,
                    p_date: today,
                },
            );

            if (rpcError) {
                // Non-fatal: if the RPC doesn't exist yet or fails, allow through
                console.warn('Quota RPC failed, allowing through:', rpcError.message);
            } else {
                const newCount = rpcData as number;
                if (newCount > limit) {
                    return new Response(
                        JSON.stringify({
                            error: 'quota_exceeded',
                            limit,
                            used: newCount,
                            message: quotaUserId
                                ? `You have used all ${limit} diagnoses for today. Your quota resets at midnight.`
                                : `You have used all ${limit} free diagnoses for today. Sign in for more.`,
                        }),
                        { status: 429, headers: { 'Content-Type': 'application/json', ...quotaExtraHeaders } }
                    );
                }
            }
        } catch (quotaErr) {
            // Non-fatal: if the usage table doesn't exist yet or query fails, allow through
            console.warn('Quota check skipped (error):', quotaErr);
        }
        recordStage(timings, 'quota_check_ms', quotaStageStartedAt);
    }
    // ── End quota ───────────────────────────────────────────────────────────────

    const startedAt = Date.now();
    interface Provider {
        name: string;
        rating: number;
        ratingCount: number;
        services?: { full: string }[];
        isFavourite?: boolean;
        favouriteReason?: string;
    }
    interface ContentPart {
        text?: string;
        inlineData?: {
            data: string;
            mimeType: string;
        };
    }
    interface ContentMessage {
        role: 'user' | 'model';
        parts: ContentPart[];
    }
    interface HistoryMessage {
        role: 'user' | 'assistant';
        content?: string;
        attachment_descriptions?: string[];
        attachments?: unknown[];
    }
    try {
        const parseStageStartedAt = Date.now();
        const body = await req.json();
        recordStage(timings, 'parse_request_body_ms', parseStageStartedAt);
        const {
            image,
            textQuery,
            history,
            feedback,
            providers,
            previousDiagnosis,
            diagnosisRejected,
            userSelectedTrade,
            attachments,
            initial_image_description,
            serviceCatalog,
            analysisPhase,
            stream: streamResponse,
            providerHydration,
        } = body;
        const wantsStream = streamResponse === true;

        // ── Input guards ───────────────────────────────────────────────────────
        if (Array.isArray(history) && history.length > 20) {
            return new Response(
                JSON.stringify({ error: 'History too long. Maximum 20 turns allowed.' }),
                { status: 400 },
            );
        }
        if (Array.isArray(attachments) && attachments.length > 9) {
            return new Response(
                JSON.stringify({ error: 'Too many attachments. Maximum 9 extra images (10 total with primary).' }),
                { status: 400 },
            );
        }
        if (typeof textQuery === 'string' && textQuery.length > 2000) {
            return new Response(
                JSON.stringify({ error: 'Text query too long. Maximum 2000 characters.' }),
                { status: 400 },
            );
        }
        // SSRF guard: if image is a URL (not a data URI), ensure it is from an
        // allowed origin. This prevents server-side requests to internal endpoints.
        if (typeof image === 'string' && image.startsWith('http') && !isAllowedImageUrl(image)) {
            return new Response(
                JSON.stringify({ error: 'Invalid image URL.' }),
                { status: 400 },
            );
        }

        const attachmentImages = Array.isArray(attachments)
            ? attachments
                  .filter((a: unknown) => typeof a === 'string')
                  .map((a) => String(a).trim())
                  .filter(Boolean)
            : [];

        // Basic request-shape logging only; detailed metrics are captured at the end.
        // eslint-disable-next-line no-console
        console.warn(
            JSON.stringify({
                type: 'ai_request',
                endpoint: 'diagnose',
                hasImage: Boolean(image),
                hasText: Boolean(textQuery),
                attachmentsCount: attachmentImages.length,
                historyLength: Array.isArray(history) ? history.length : 0,
            })
        );

        const hasAttachments = attachmentImages.length > 0;
        const isTextOnly =
            !image && !hasAttachments && typeof textQuery === 'string';
        if (!image && !isTextOnly && !hasAttachments) {
            // eslint-disable-next-line no-console
            console.error('No image, text query, or attachments provided');
            return new Response(
                JSON.stringify({
                    error: 'Please provide an image or describe your issue in text.',
                }),
                { status: 400 }
            );
        }

        const normalizedProviders = normalizeProvidersForPrompt(providers) ?? [];
        const providersForPrompt = normalizedProviders.length > 0 ? normalizedProviders : undefined;
        const providerHydrationRequested = providerHydration === true;
        const prevDiagForHydration = previousDiagnosis as
            | {
                  diagnosis?: string;
                  trade?: string;
                  trade_detail?: string;
                  message?: string;
                  action_required?: string;
              }
            | null
            | undefined;
        const isProviderHydration = Boolean(
            providerHydrationRequested &&
                providersForPrompt &&
                providersForPrompt.length > 0 &&
                prevDiagForHydration &&
                typeof prevDiagForHydration.diagnosis === 'string' &&
                prevDiagForHydration.diagnosis.trim().length > 0 &&
                typeof image === 'string' &&
                image.trim().length > 0 &&
                !isTextOnly
        );
        const isFollowUp =
            !!(history?.length && prevDiagForHydration?.diagnosis) || isProviderHydration;

        const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
            // Works in both Node and browser-like runtimes.
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(buffer).toString('base64');
            }
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode(...chunk);
            }
            // eslint-disable-next-line no-undef
            return btoa(binary);
        };

        const imageStringToInlineData = async (img: string): Promise<ContentPart | null> => {
            // Existing clients send `data:<mime>;base64,...`.
            if (img.startsWith('data:')) {
                const base64Data = img.split(',')[1];
                const mimeType = img.split(';')[0].split(':')[1];
                if (!base64Data || !mimeType) return null;
                const approxBytes = Math.floor((base64Data.length * 3) / 4);
                if (approxBytes > MAX_DIAGNOSE_IMAGE_BYTES) {
                    console.warn(
                        `[diagnose] image dropped — exceeds ${MAX_DIAGNOSE_IMAGE_BYTES / (1024 * 1024)}MB guardrail`,
                        { approxBytes, mimeType },
                    );
                    return null;
                }
                return { inlineData: { data: base64Data, mimeType } };
            }

            if (img.startsWith('http') && !isAllowedImageUrl(img)) {
                return null;
            }

            // Newer flow stores a public Supabase URL in `conversations.image_url`.
            try {
                const res = await fetch(img);
                if (!res.ok) return null;
                const mimeType = res.headers.get('content-type') || 'image/jpeg';
                const bytes = await res.arrayBuffer();
                if (bytes.byteLength > MAX_DIAGNOSE_IMAGE_BYTES) {
                    console.warn(
                        `[diagnose] remote image dropped — exceeds ${MAX_DIAGNOSE_IMAGE_BYTES / (1024 * 1024)}MB guardrail`,
                        { byteLength: bytes.byteLength, url: img.slice(0, 80) },
                    );
                    return null;
                }
                const base64Data = arrayBufferToBase64(bytes);
                return { inlineData: { data: base64Data, mimeType } };
            } catch {
                return null;
            }
        };

        const hasUserContext = userSelectedTrade?.trade && userSelectedTrade?.diagnosis;
        const model = getDiagnosisModel();

        if (analysisPhase === 'image_thought_only') {
            const imageParts: ContentPart[] = [];
            if (typeof image === 'string' && image.trim()) {
                const inline = await imageStringToInlineData(image.trim());
                if (inline) imageParts.push(inline);
            }
            for (const att of attachmentImages) {
                const inline = await imageStringToInlineData(att);
                if (inline) imageParts.push(inline);
            }
            if (imageParts.length === 0) {
                return new Response(
                    JSON.stringify({ error: 'No image available for analysis.' }),
                    { status: 400 }
                );
            }

            const quickPrompt = buildQuickThoughtPrompt(imageParts.length);
            const quickContents = [
                {
                    role: 'user',
                    parts: [...imageParts, { text: quickPrompt }],
                } as unknown as GeminiContent,
            ];
            const quickGenerationConfig = {
                temperature: 0.2,
                topP: 0.7,
                topK: 20,
                maxOutputTokens: 220,
            };
            const fallbackThought =
                'Photo is not clear enough to give a confident diagnosis. Uploading a sharper or closer image of the problem area will help.';

            if (wantsStream) {
                try {
                    const quickStream = await model.generateContentStream({
                        contents: quickContents,
                        generationConfig: quickGenerationConfig,
                    });
                    return new Response(
                        new ReadableStream({
                            async start(controller) {
                                const encoder = new TextEncoder();
                                const emit = (o: unknown) =>
                                    controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));
                                let accum = '';
                                let lastThought = '';
                                try {
                                    for await (const chunk of quickStream.stream) {
                                        const piece = chunk.text();
                                        if (!piece) continue;
                                        accum += piece;
                                        const inner = extractPartialThoughtInner(accum);
                                        if (inner !== null && inner !== lastThought) {
                                            lastThought = inner;
                                            emit({ type: 'thought', text: inner });
                                        }
                                    }
                                    const thought = stripFillerSentenceStarts(
                                        extractThoughtText(String(accum || ''))
                                    ).trim();
                                    emit({
                                        type: 'complete',
                                        full: `<thought>${thought || fallbackThought}</thought>`,
                                    });
                                } catch (streamErr) {
                                    console.warn(
                                        'image_thought_only stream failed; using fallback',
                                        streamErr
                                    );
                                    emit({
                                        type: 'complete',
                                        full: `<thought>${fallbackThought}</thought>`,
                                    });
                                } finally {
                                    controller.close();
                                }
                            },
                        }),
                        {
                            headers: {
                                'Content-Type': 'application/x-ndjson; charset=utf-8',
                                'Cache-Control': 'no-store',
                                ...DIAGNOSE_RESPONSE_META_HEADERS,
                                ...quotaExtraHeaders,
                            },
                        }
                    );
                } catch {
                    // fall through to non-streaming quick path
                }
            }

            let thought = '';
            try {
                const quickResult = await model.generateContent({
                    contents: quickContents,
                    generationConfig: quickGenerationConfig,
                });
                const quickResp = (quickResult as any)?.response;
                let quickText = quickResp && typeof quickResp.text === 'function' ? quickResp.text() : '';
                if (!quickText) {
                    const parts = (quickResult as any)?.response?.candidates?.[0]?.content?.parts;
                    if (Array.isArray(parts)) {
                        quickText = parts
                            .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
                            .join('');
                    }
                }
                thought = stripFillerSentenceStarts(extractThoughtText(String(quickText || ''))).trim();
            } catch (quickThoughtErr) {
                // Optional warm-up call from the client; must not fail the overall diagnosis flow.
                console.warn('image_thought_only: Gemini failed; returning fallback thought', quickThoughtErr);
            }

            const wrappedThought = thought || fallbackThought;
            if (wantsStream) {
                const wrapped = `<thought>${wrappedThought}</thought>`;
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            const encoder = new TextEncoder();
                            const inner = extractPartialThoughtInner(wrapped);
                            if (inner) {
                                controller.enqueue(
                                    encoder.encode(`${JSON.stringify({ type: 'thought', text: inner })}\n`)
                                );
                            }
                            controller.enqueue(
                                encoder.encode(`${JSON.stringify({ type: 'complete', full: wrapped })}\n`)
                            );
                            controller.close();
                        },
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/x-ndjson; charset=utf-8',
                            'Cache-Control': 'no-store',
                            ...DIAGNOSE_RESPONSE_META_HEADERS,
                            ...quotaExtraHeaders,
                        },
                    }
                );
            }
            return new Response(`<thought>${wrappedThought}</thought>`, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    ...DIAGNOSE_RESPONSE_META_HEADERS,
                    ...quotaExtraHeaders,
                },
            });
        }

        let serviceList = Array.isArray(serviceCatalog)
            ? serviceCatalog.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim())
            : [];
        if (serviceList.length === 0) {
            const serviceCatalogStageStartedAt = Date.now();
            serviceList = await getServiceCatalogLabelsCached();
            recordStage(timings, 'service_catalog_cache_or_db_ms', serviceCatalogStageStartedAt);
        }
        if (serviceList.length === 0) {
            // Supabase unavailable — fall back to the static canonical list so users
            // are never blocked from a diagnosis during a brief infrastructure hiccup.
            console.warn('[diagnose] service catalog empty after cache/db fetch — using SERVICE_LABELS fallback');
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
        // Agent 2b uses responseSchema structured output — strip the tagged-output
        // format rules that contradict it and waste ~600 tokens per call.
        const proseBaseInstruction = buildProseBaseInstruction(promptContext);

        const userOriginalWordsHydration = (
            typeof textQuery === 'string' ? textQuery : ''
        ).trim();
        const hydrationAppendix =
            isProviderHydration
                ? `\n\n${buildProviderHydrationPromptBlock(userOriginalWordsHydration)}`
                : '';
        const instructionPrefix = `${systemInstruction.trim()}${hydrationAppendix}\n\n`;

        const tieringLogMeta: Record<string, unknown> = {
            imagesInRequest: 0,
            imagesAfterTier: 0,
            imageTierMs: null as number | null,
            tierMultiIssue: false,
            tierFallback: false,
        };

        // Gemini v1 doesn't accept the SDK-level `systemInstruction` field.
        // Embed the same instructions directly into the first user prompt text instead.

        // Format history for Gemini. We never send image bytes in history — only stored text descriptions.
        const contents: ContentMessage[] = [];

        const buildTextForMessage = (msg: HistoryMessage) => {
            let content = msg.content || '';
            const descs = msg.attachment_descriptions as string[] | undefined;
            if (descs && Array.isArray(descs) && descs.length > 0) {
                content += (content ? '\n\n' : '') + '[Images: ' + descs.join('; ') + ']';
            } else if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
                content += (content ? '\n\n' : '') + '[User uploaded an image here]';
            }
            return content;
        };

        if (initial_image_description && typeof initial_image_description === 'string' && initial_image_description.trim()) {
            contents.push({
                role: 'user',
                parts: [{ text: '[Initial image: ' + initial_image_description.trim() + ']' }],
            });
        }

        if (isTextOnly) {
            // Text-only or follow-up with optional new images.
            // If we have history, this is a follow-up: add history (text only, no image data) then textQuery + attachments as final user turn.
            if (history && history.length > 0) {
                const followInlineGathered: ContentPart[] = [];
                for (const att of attachmentImages) {
                    const inline = await imageStringToInlineData(att);
                    if (inline) {
                        followInlineGathered.push(inline);
                    }
                }
                tieringLogMeta.imagesInRequest = followInlineGathered.length;
                tieringLogMeta.imagesAfterTier = followInlineGathered.length;

                for (let i = 0; i < history.length; i++) {
                    const msg = history[i] as HistoryMessage;
                    const parts: ContentPart[] = [];
                    const content = buildTextForMessage(msg);
                    if (content) parts.push({ text: content });
                    if (parts.length > 0) {
                        contents.push({
                            role: msg.role === 'assistant' ? 'model' : 'user',
                            parts,
                        });
                    }
                }
                const finalParts: ContentPart[] = [...followInlineGathered];
                const textPart = ((textQuery as string) || '').trim();
                if (textPart) {
                    finalParts.push({ text: instructionPrefix + textPart });
                } else if (finalParts.length > 0) {
                    finalParts.push({
                        text:
                            instructionPrefix +
                            'The user uploaded new images for you to analyse. Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>.',
                    });
                }
                if (finalParts.length > 0) {
                    contents.push({ role: 'user', parts: finalParts });
                }
            } else {
                const textPrompt = buildTextOnlyFirstMessagePrompt({
                    instructionPrefix,
                    textQuery: (textQuery as string).trim(),
                    hasUserContext: Boolean(hasUserContext),
                    userSelectedTrade: hasUserContext ? userSelectedTrade : null,
                });
                contents.push({ role: 'user', parts: [{ text: textPrompt }] });
            }
        } else {
            const imageParts: ContentPart[] = [];

            if (image) {
                const inline = await imageStringToInlineData(image);
                if (inline) imageParts.push(inline);
            }

            for (const att of attachmentImages) {
                const inline = await imageStringToInlineData(att);
                if (inline) imageParts.push(inline);
            }

            tieringLogMeta.imagesInRequest = imageParts.length;
            tieringLogMeta.imagesAfterTier = imageParts.length;

            const hasImagesToAnalyse = imageParts.length > 0;
            const userTextQuery = (textQuery as string | undefined)?.trim() || '';
            /** First-image requests previously omitted textQuery entirely — user corrections were invisible to the model. */
            const userWordsPriority =
                userTextQuery.length > 0
                    ? `USER'S OWN WORDS ABOUT THE ISSUE (read first; if these disagree with a visual guess, trust the user on equipment type and job context):\n${JSON.stringify(userTextQuery)}\n\n`
                    : '';
            const imagePrompt = isProviderHydration && !history?.length
                ? buildProviderHydrationImagePrompt({
                        instructionPrefix,
                        userWordsPriority,
                        imageCount: imageParts.length,
                    })
                : !history?.length
                  ? buildImageFirstMessagePrompt({
                        instructionPrefix,
                        userWordsPriority,
                        imageCount: imageParts.length,
                        hasUserContext: Boolean(hasUserContext),
                        userSelectedTrade: hasUserContext ? userSelectedTrade : null,
                    })
                  : hasImagesToAnalyse
                  ? buildImageFollowUpPrompt({
                        instructionPrefix,
                        userTextQuery,
                    })
                  : null;

            contents.push({
                role: 'user',
                parts: [...imageParts, ...(imagePrompt ? [{ text: imagePrompt }] : [])],
            });
        }

        // Add history if present (image branch only; text-only builds full contents above). History is text-only — no image bytes.
        if (!isTextOnly && history && history.length > 0) {
            for (let i = 0; i < history.length; i++) {
                const msg = history[i] as HistoryMessage;
                const parts: ContentPart[] = [];
                const content = buildTextForMessage(msg);
                if (content) parts.push({ text: content });
                if (parts.length > 0) {
                    contents.push({
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts,
                    });
                }
            }
        }

        // ── Multi-agent pipeline: Agent 2a (classify) + Agent 2b (prose) ──────────
        //
        // Architecture:
        //   1. Optional client `image_thought_only` — separate lightweight request some
        //      flows fire for early UX; it does not gate Agent 2a and is not awaited
        //      by the server. The processing orchestrator may fire it without blocking.
        //   2. Server quick-thought stream (when stream:true and images present) — extra
        //      Gemini stream in Promise.all with Agent 2a for immediate NDJSON thought
        //      chunks; superseded by Agent 2b’s thought in the final payload.
        //   3. Agent 2a (classify) — schema-enforced JSON; must finish before 2b.
        //   4. Agent 2b (prose) — receives Agent 2a classification as locked ground truth.
        //
        // The response format remains backwards-compatible: the NDJSON stream still
        // emits { type:'thought', text } and { type:'complete', full } where `full`
        // is the existing <thought>…</thought><json>…</json> string that the frontend
        // already knows how to parse. This keeps all downstream UI code unchanged.

        const pipelineStartedAt = Date.now();

        // ── Helper: stream a quick thought while Agent 2a runs ──────────────────
        // When streaming is requested and an image is present, we fire a lightweight
        // thought-only stream in parallel with classification so the user sees text
        // immediately. The thought is later superseded by Agent 2b's authoritative
        // thought field in the complete response.
        const quickThoughtContents: ContentMessage[] = isTextOnly
            ? []
            : (() => {
                  const imageParts2: ContentPart[] = [];
                  // Re-use the already-resolved inline data via the existing `contents` array
                  // (first user turn contains the image parts). We only need the image parts.
                  const firstUserTurn = (contents as ContentMessage[]).find((c) => c.role === 'user');
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

        const SPRING_SIGNAL_REGEX = /\b(spring|hinge|rod|connecting rod|tension)\b/i;
        const hasSpringSignal = (value: unknown): boolean =>
            typeof value === 'string' && SPRING_SIGNAL_REGEX.test(value);
        const countSpringSignals = (values: unknown[]): number =>
            values.reduce<number>((count, value) => count + (hasSpringSignal(value) ? 1 : 0), 0);
        const inferTradeFromProseFallback = (value: unknown, allowed: string[]): string => {
            const raw = typeof value === 'string' ? value : '';
            if (!raw.trim()) return '';
            const taxonomyHit = inferTradeFromSignals(raw);
            if (taxonomyHit) {
                const hit = allowed.find((l) => l.toLowerCase() === taxonomyHit.trade.toLowerCase());
                if (hit) return hit;
                return taxonomyHit.trade;
            }
            const t = raw.toLowerCase();
            if (/\b(garage door|gate motor|garage motor|roller shutter|access control)\b/.test(t)) {
                const hit = allowed.find((l) => l.toLowerCase() === 'security');
                return hit ?? 'Security';
            }
            if (/\b(leak|pipe|geyser|toilet|tap|drain|plumbing)\b/.test(t)) {
                const hit = allowed.find((l) => l.toLowerCase() === 'plumbing');
                return hit ?? 'Plumbing';
            }
            if (/\b(trip|db board|socket|light|wiring|electrical)\b/.test(t)) {
                const hit = allowed.find((l) => l.toLowerCase() === 'electrical');
                return hit ?? 'Electrical';
            }
            const loose = tradeToServiceLabel(raw);
            if (!loose) return '';
            const hit = allowed.find((l) => l.toLowerCase() === loose.toLowerCase());
            return hit ?? loose;
        };

        /** Align trade/trade_detail with taxonomy keywords when prose contradicts classification. */
        const reconcileTradeFromDiagnosisSignals = (
            j: Record<string, unknown>,
            cls: {
                trade: string;
                subcategory_id: string;
            },
            allowed: string[],
        ): void => {
            const rejected = Boolean(j.rejected);
            const unserviced = Boolean(j.unserviced);
            const tradeStr = typeof j.trade === 'string' ? j.trade.trim() : '';
            if (rejected || unserviced || !tradeStr || tradeStr.toLowerCase() === 'n/a') return;

            const primary = [
                j.diagnosis,
                j.estimated_diagnosis_sentence,
                j.trade_detail,
                typeof j.message === 'string' ? (j.message as string).slice(0, 800) : '',
            ]
                .map((x) => (typeof x === 'string' ? x : ''))
                .join(' | ');

            const inferred = inferTradeFromSignals(primary);
            if (!inferred) return;

            const inferredAllowed = allowed.find((l) => l.toLowerCase() === inferred.trade.toLowerCase());
            const curResolved =
                allowed.find((l) => l.toLowerCase() === tradeStr.toLowerCase()) ?? tradeStr;
            const inferredNorm = inferredAllowed ?? inferred.trade;
            const curNorm = curResolved;

            if (inferredNorm.toLowerCase() === curNorm.toLowerCase()) return;

            const handyman = allowed.find((l) => l.toLowerCase() === 'general handyman') ?? 'General Handyman';

            const shouldOverride =
                handyman.toLowerCase() === curNorm.toLowerCase() ||
                cls.subcategory_id === TAXONOMY_NONE_ID;

            if (!shouldOverride) return;

            const nextTrade = inferredAllowed ?? inferredNorm;
            if (!allowed.some((l) => l.toLowerCase() === nextTrade.toLowerCase())) return;

            const resolved = allowed.find((l) => l.toLowerCase() === nextTrade.toLowerCase()) ?? nextTrade;
            j.trade = resolved;
            j.trade_detail = inferred.label;
            j.subcategory_id = inferred.subcategoryId;
        };

        /**
         * Returns 3–4 short homeowner-perspective clarification chips appropriate
         * for the given trade. Used as a fallback when Agent 2b returns
         * requires_clarification but no clarification_questions.
         */
        function buildTradeFallbackClarificationChips(trade: string): string[] {
            const t = (trade ?? '').toLowerCase().trim();
            if (t.includes('electrical')) {
                return [
                    'There is no power to a circuit or outlet.',
                    'A switch, fitting, or light is not working.',
                    'There is tripping, sparking, or a burning smell.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('plumbing')) {
                return [
                    'There is a visible leak or drip.',
                    'A drain or pipe is blocked.',
                    'The geyser or hot water is not working.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('security') || t.includes('access')) {
                return [
                    'The gate opens but does not close.',
                    'The gate does not respond to the remote.',
                    'The intercom or access panel is faulty.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('pool')) {
                return [
                    'The pump or filter is not running.',
                    'The water is discoloured or has algae.',
                    'There is a visible leak.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('carpentry') || t.includes('woodwork')) {
                return [
                    'A door, window, or cabinet is not closing properly.',
                    'There is visible damage or rot.',
                    'A fitting or hinge needs replacing.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('painting')) {
                return [
                    'There is peeling, cracking, or bubbling paint.',
                    'There is damp staining on a wall.',
                    'A surface needs repainting after repairs.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('flooring') || t.includes('tiling')) {
                return [
                    'Tiles are cracked, loose, or lifting.',
                    'Grout is damaged or discoloured.',
                    'A floor surface needs replacing or repairing.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('building') || t.includes('construction')) {
                return [
                    'There is a crack in a wall or ceiling.',
                    'There is damp, water ingress, or a leak.',
                    'Structural work or an extension is needed.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('handyman')) {
                return [
                    'It is a small repair or odd job.',
                    'Assembly or installation is needed.',
                    'Multiple small tasks need doing.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('locksmith')) {
                return [
                    'A lock is broken or not working.',
                    'Keys are lost or a lock needs rekeying.',
                    'A new lock or deadbolt needs fitting.',
                    'Something else is happening.',
                ];
            }
            if (t.includes('welding')) {
                return [
                    'A metal gate, fence, or fitting is broken.',
                    'A structural metal component needs repair.',
                    'Something else is happening.',
                ];
            }
            // Generic fallback for unknown or N/A trade
            return [
                'The issue is with a fitting or fixture.',
                'The issue is structural or with a surface.',
                'The issue involves a mechanical or electrical component.',
                'Something else is happening.',
            ];
        }

        /**
         * Build the final backwards-compatible response string.
         * Wraps Agent 2b output + Agent 2a classification into the existing
         * <thought>…</thought><json>…</json> format the frontend parses.
         */
        function buildCompatibleResponseText(
            thoughtText: string,
            classification: Awaited<ReturnType<typeof runClassification>>,
            prose: Awaited<ReturnType<typeof runProseGeneration>>,
        ): string {
            const ensuredThought =
                thoughtText.trim().length >= 50
                    ? thoughtText.trim()
                    : prose.thought?.trim() ||
                      'Photo is not clear enough for a confident diagnosis. Uploading a sharper or closer image of the problem area will help.';

            const jsonBody = {
                // Prose fields (Agent 2b)
                thought: ensuredThought,
                thinking: ensuredThought,
                diagnosis: prose.diagnosis,
                estimated_diagnosis_sentence: prose.estimated_diagnosis_sentence,
                message: prose.message,
                action_required: prose.action_required,
                image_descriptions: prose.image_descriptions ?? [],
                image_thought_breakdown: Array.isArray(prose.image_descriptions)
                    ? prose.image_descriptions
                          .filter((x) => typeof x === 'string')
                          .map((x) => String(x).trim())
                          .filter(Boolean)
                    : [],
                clarification_questions: Array.isArray(prose.clarification_questions)
                    ? prose.clarification_questions.filter((q) => typeof q === 'string' && q.trim().length > 0)
                    : [],
                // Classification fields (Agent 2a — ground truth)
                trade: classification.trade,
                trade_detail: classification.trade_detail,
                confidence: classification.confidence,
                rejected: classification.rejected,
                requires_clarification: classification.requires_clarification,
                unserviced: classification.unserviced,
                refetch_providers: classification.refetch_providers,
                unsupported_reason: classification.unsupported_reason ?? '',
                subcategory_id: classification.subcategory_id,
                // Metadata
                prompt_version: DIAGNOSE_PROMPT_VERSION,
                ai_model: GEMINI_MODEL_NAME,
                pipeline: 'v2-classify-prose',
            };

            logIfDiagnosisJsonShapeUnexpected(jsonBody);

            // Apply post-processing to special cases still needed by the system:
            // unrelated image and unsupported service overrides.
            let finalJson = jsonBody as typeof jsonBody & Record<string, unknown>;
            const isLikelyClassificationFallback =
                !classification.requestFailed &&
                classification.trade.trim().toLowerCase() === 'n/a' &&
                Number(classification.confidence ?? 0) === 0 &&
                !classification.unserviced &&
                !classification.rejected &&
                !String(classification.unsupported_reason ?? '').trim();
            // Keep explicit "diagnosis rejected" follow-ups intact so users see
            // the targeted clarification question generated by the model.
            if (classification.rejected && !classification.unserviced && !diagnosisRejected) {
                const msg = buildUnrelatedImageMessage();
                finalJson = {
                    ...finalJson,
                    diagnosis: 'Photo Not Related to Home Maintenance',
                    estimated_diagnosis_sentence: 'Photo Not Related to Home Maintenance',
                    trade: 'N/A',
                    trade_detail: '',
                    subcategory_id: TAXONOMY_NONE_ID,
                    message: msg,
                    action_required: msg,
                    requires_clarification: true,
                };
            } else if (
                classification.unserviced ||
                (classification.trade.toLowerCase() === 'n/a' && !isLikelyClassificationFallback)
            ) {
                const msg = buildUnsupportedHomeServiceMessage(serviceList);
                finalJson = {
                    ...finalJson,
                    diagnosis: 'Service Not Currently Supported',
                    estimated_diagnosis_sentence: 'Service Not Currently Supported',
                    trade: 'N/A',
                    trade_detail: '',
                    subcategory_id: TAXONOMY_NONE_ID,
                    message: msg,
                    action_required: msg,
                    requires_clarification: true,
                };
            }

            if (diagnosisRejected) {
                const clean = (v: unknown) =>
                    typeof v === 'string' ? v.trim().toLowerCase() : '';
                const prevDiag = clean((previousDiagnosis as { diagnosis?: unknown } | null)?.diagnosis);
                const prevTrade = clean((previousDiagnosis as { trade?: unknown } | null)?.trade);
                const nextDiag = clean(finalJson.diagnosis);
                const nextTrade = clean(finalJson.trade);
                const repeatedDiagnosis =
                    Boolean(prevDiag) &&
                    Boolean(prevTrade) &&
                    prevDiag === nextDiag &&
                    prevTrade === nextTrade;
                const chips = Array.isArray(finalJson.clarification_questions)
                    ? finalJson.clarification_questions
                          .map((q) => (typeof q === 'string' ? q.trim() : ''))
                          .filter((q) => q.length > 0)
                          .slice(0, 3)
                    : [];
                const fallbackQuestion =
                    'Which part is actually giving trouble — opening, closing, remote response, or something else?';
                const targetedQuestion =
                    chips.length >= 2
                        ? `What best matches the issue: ${chips.join(', ')}?`
                        : chips.length === 1
                          ? `Does this best describe the issue: ${chips[0]}?`
                          : fallbackQuestion;
                const forcedMessage = `Sorry for getting that wrong. ${targetedQuestion}`;
                const fallbackClarificationQuestions = chips.length > 0
                    ? chips
                    : buildTradeFallbackClarificationChips(classification.trade);
                if (repeatedDiagnosis) {
                    finalJson = {
                        ...finalJson,
                        // A repeated diagnosis after explicit rejection should force clarification.
                        rejected: false,
                        unserviced: false,
                        requires_clarification: true,
                        confidence: Math.min(
                            75,
                            Number.isFinite(Number(finalJson.confidence))
                                ? Number(finalJson.confidence)
                                : 75
                        ),
                        diagnosis: 'Needs Clarification',
                        estimated_diagnosis_sentence: 'Needs Clarification',
                        clarification_questions: fallbackClarificationQuestions,
                        message: forcedMessage,
                        action_required: forcedMessage,
                    };
                }
            }

            if (
                isLikelyClassificationFallback &&
                !prose.requestFailed &&
                !String(finalJson.diagnosis ?? '')
                    .toLowerCase()
                    .includes('service not currently supported')
            ) {
                const inferredTrade =
                    inferTradeFromProseFallback(finalJson.diagnosis, serviceList) ||
                    inferTradeFromProseFallback(finalJson.message, serviceList) ||
                    serviceList.find((s) => s.toLowerCase() === 'general handyman') ||
                    'General Handyman';
                const taxFromDiag =
                    inferTradeFromSignals(String(finalJson.diagnosis ?? '')) ||
                    inferTradeFromSignals(String(finalJson.message ?? ''));
                // Cap confidence below the 85 provider-surfacing threshold so the user
                // sees the inferred trade but is still asked to confirm before providers
                // appear. The old value of Math.max(85, ...) was presenting forced-inferred
                // trades with full confidence, which is misleading.
                const inferredConfidence = Math.max(72, Number(finalJson.confidence ?? 0));
                finalJson = {
                    ...finalJson,
                    trade: inferredTrade,
                    trade_detail: taxFromDiag ? taxFromDiag.label : '',
                    subcategory_id: taxFromDiag ? taxFromDiag.subcategoryId : TAXONOMY_NONE_ID,
                    confidence: inferredConfidence,
                    requires_clarification: true,
                    unsupported_reason: 'N/A',
                };
            }

            if (!prose.requestFailed) {
                reconcileTradeFromDiagnosisSignals(
                    finalJson as Record<string, unknown>,
                    {
                        trade: classification.trade,
                        subcategory_id: classification.subcategory_id,
                    },
                    serviceList,
                );
            }

            if (classification.requestFailed || prose.requestFailed) {
                finalJson = {
                    ...finalJson,
                    requires_clarification: true,
                    rejected: Boolean(finalJson.rejected),
                    unserviced: Boolean(finalJson.unserviced),
                    confidence: Math.min(
                        65,
                        Number.isFinite(Number(finalJson.confidence)) ? Number(finalJson.confidence) : 65
                    ),
                    unsupported_reason: '',
                };
                const explain =
                    'We could not finish the automated analysis for these photos right now. ';
                if (
                    typeof finalJson.message === 'string' &&
                    !finalJson.message.toLowerCase().includes('could not finish')
                ) {
                    finalJson.message = `${explain}${finalJson.message}`;
                }
            }

            if (
                finalJson.requires_clarification &&
                (!Array.isArray(finalJson.clarification_questions) ||
                    finalJson.clarification_questions.length === 0)
            ) {
                finalJson = {
                    ...finalJson,
                    clarification_questions: buildTradeFallbackClarificationChips(classification.trade),
                };
            }

            return `<thought>${ensuredThought}</thought>\n<json>${JSON.stringify(finalJson)}</json>`;
        }

        if (wantsStream) {
            return new Response(
                new ReadableStream({
                    async start(controller) {
                        const encoder = new TextEncoder();
                        const emit = (o: unknown) =>
                            controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));

                        let streamedThought = '';

                        try {
                            if (hasQuickThought) {
                                // ── Parallel: quick thought stream + Agent 2a classify ──────────
                                const quickModel = getDiagnosisModel();
                                const [, classification] = await Promise.all([
                                    // Quick thought stream — emits chunks live to the UI
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
                                                    emit({ type: 'thought', text: inner });
                                                }
                                            }
                                            streamedThought = stripFillerSentenceStarts(
                                                extractThoughtText(accum),
                                            ).trim();
                                        } catch {
                                            // Non-fatal: prose agent's thought will be used in complete
                                        }
                                    })(),
                                    // Agent 2a: classification (runs in parallel with thought stream)
                                    runClassification(
                                        contents as unknown as GeminiContent[],
                                        serviceListText,
                                        serviceList,
                                    ),
                                ]);
                                recordStage(timings, 'agent2a_classify_ms', pipelineStartedAt);

                                // ── Agent 2b: prose (runs after classification) ──────────────────
                                const rawProse = await runProseGeneration({
                                    contents: contents as unknown as GeminiContent[],
                                    classification,
                                    baseSystemInstruction: proseBaseInstruction,
                                    isProviderHydration,
                                    imageCount: tieringLogMeta.imagesAfterTier as number,
                                });
                                const prose = normaliseProse(rawProse);
                                recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

                                const full = buildCompatibleResponseText(
                                    streamedThought || prose.thought,
                                    classification,
                                    prose,
                                );
                                emit({ type: 'complete', full });
                            } else {
                                // ── Text-only or non-streaming thought: sequential 2a → 2b ────────
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
                                    imageCount: tieringLogMeta.imagesAfterTier as number,
                                });
                                const prose = normaliseProse(rawProse);
                                recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

                                // Emit thought for UI, then complete
                                if (prose.thought?.trim()) {
                                    emit({ type: 'thought', text: prose.thought.trim() });
                                }
                                const full = buildCompatibleResponseText(
                                    prose.thought,
                                    classification,
                                    prose,
                                );
                                emit({ type: 'complete', full });
                            }

                        } catch (e) {
                            console.error('Multi-agent pipeline error:', e);
                            controller.error(e);
                            return;
                        }

                        const durationMs = Date.now() - startedAt;
                        recordStage(timings, 'total_request_ms', requestStartedAt);
                        logAiEvent({
                            endpoint: 'diagnose',
                            status: 'ok',
                            durationMs,
                            meta: diagnoseAiLogMeta({
                                isTextOnly,
                                isFollowUp,
                                hasUserContext,
                                hasImage: Boolean(image),
                                attachmentsCount: attachmentImages.length,
                                historyLength: Array.isArray(history) ? history.length : 0,
                                usedGenerateContentFallback: false,
                                ndjsonStream: true,
                                pipeline: 'v2-classify-prose',
                                ...tieringLogMeta,
                            }),
                        });
                        logDiagnoseTimings('ok', timings);
                        controller.close();
                    },
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-ndjson; charset=utf-8',
                        'Cache-Control': 'no-store',
                        ...DIAGNOSE_RESPONSE_META_HEADERS,
                        ...quotaExtraHeaders,
                    },
                },
            );
        }

        // ── Non-streaming path ──────────────────────────────────────────────────
        {
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
                imageCount: tieringLogMeta.imagesAfterTier as number,
            });
            const prose = normaliseProse(rawProse);
            recordStage(timings, 'agent2b_prose_ms', pipelineStartedAt);

            const full = buildCompatibleResponseText(prose.thought, classification, prose);
            const durationMs = Date.now() - startedAt;
            recordStage(timings, 'total_request_ms', requestStartedAt);
            logAiEvent({
                endpoint: 'diagnose',
                status: 'ok',
                durationMs,
                meta: diagnoseAiLogMeta({
                    isTextOnly,
                    isFollowUp,
                    hasUserContext,
                    hasImage: Boolean(image),
                    attachmentsCount: attachmentImages.length,
                    historyLength: Array.isArray(history) ? history.length : 0,
                    usedGenerateContentFallback: false,
                    pipeline: 'v2-classify-prose',
                    ...tieringLogMeta,
                }),
            });
            logDiagnoseTimings('ok', timings);

            return new Response(full, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    ...DIAGNOSE_RESPONSE_META_HEADERS,
                    ...quotaExtraHeaders,
                },
            });
        }

    } catch (error: unknown) {
        const durationMs = Date.now() - startedAt;
        recordStage(timings, 'total_request_ms', requestStartedAt);
        const maybeErr = error as { message?: unknown; toString?: unknown };
        const metaError =
            typeof maybeErr.message === 'string'
                ? maybeErr.message
                : typeof maybeErr.toString === 'function'
                  ? maybeErr.toString()
                  : 'Unknown error';
        logAiEvent({
            endpoint: 'diagnose',
            status: 'error',
            durationMs,
            meta: diagnoseAiLogMeta({
                error: metaError,
            }),
        });
        // eslint-disable-next-line no-console
        console.error('Gemini Diagnosis Error:', error);
        logDiagnoseTimings('error', timings);
        const message =
            typeof maybeErr.message === 'string'
                ? maybeErr.message
                : metaError === 'Unknown error'
                  ? 'Failed to diagnose image'
                  : String(metaError);
        return new Response(
            JSON.stringify({
                error:
                    process.env.NODE_ENV === 'development' ? message : 'Failed to diagnose image',
            }),
            { status: 500 }
        );
    }
}
