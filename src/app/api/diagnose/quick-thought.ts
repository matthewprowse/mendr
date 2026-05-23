/**
 * `analysisPhase === 'image_thought_only'` warm-up handler for /api/diagnose.
 *
 * Extracted in Phase 2 from `route.ts`. This is an optional client warm-up
 * call that streams (or returns) just a `<thought>…</thought>` block while the
 * full diagnosis pipeline runs in parallel on the client side. It is
 * fire-and-forget — must never block the overall flow.
 *
 * Behaviour preserved verbatim from the original inline implementation.
 */

import type { Content as GeminiContent } from '@google/generative-ai';
import { getDiagnosisModel } from '@/lib/ai/ai-diagnosis-backend';
import { buildQuickThoughtPrompt } from '@/features/diagnosis/prompts/user-turn';
import { stripFillerSentenceStarts } from '@/lib/ai/prompt-utils';
import {
    DIAGNOSE_RESPONSE_META_HEADERS,
    extractPartialThoughtInner,
    extractThoughtText,
} from './helpers';
import { imageStringToInlineData } from './image-loader';

interface ContentPart {
    text?: string;
    inlineData?: { data: string; mimeType: string };
}

const FALLBACK_THOUGHT =
    'Photo is not clear enough to give a confident diagnosis. Uploading a sharper or closer image of the problem area will help.';

const QUICK_GENERATION_CONFIG = {
    temperature: 0.2,
    topP: 0.7,
    topK: 20,
    maxOutputTokens: 220,
};

export interface QuickThoughtParams {
    image: string | null;
    attachmentImages: string[];
    wantsStream: boolean;
    quotaExtraHeaders: Record<string, string>;
}

export async function handleImageThoughtOnly(
    params: QuickThoughtParams,
): Promise<Response> {
    const { image, attachmentImages, wantsStream, quotaExtraHeaders } = params;
    const model = getDiagnosisModel();

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
            { status: 400 },
        );
    }

    const quickPrompt = buildQuickThoughtPrompt(imageParts.length);
    const quickContents = [
        {
            role: 'user',
            parts: [...imageParts, { text: quickPrompt }],
        } as unknown as GeminiContent,
    ];

    if (wantsStream) {
        try {
            const quickStream = await model.generateContentStream({
                contents: quickContents,
                generationConfig: QUICK_GENERATION_CONFIG,
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
                                extractThoughtText(String(accum || '')),
                            ).trim();
                            emit({
                                type: 'complete',
                                full: `<thought>${thought || FALLBACK_THOUGHT}</thought>`,
                            });
                        } catch (streamErr) {
                            console.warn(
                                'image_thought_only stream failed; using fallback',
                                streamErr,
                            );
                            emit({
                                type: 'complete',
                                full: `<thought>${FALLBACK_THOUGHT}</thought>`,
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
                },
            );
        } catch {
            // fall through to non-streaming quick path
        }
    }

    let thought = '';
    try {
        const quickResult = await model.generateContent({
            contents: quickContents,
            generationConfig: QUICK_GENERATION_CONFIG,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quickResp = (quickResult as any)?.response;
        let quickText =
            quickResp && typeof quickResp.text === 'function' ? quickResp.text() : '';
        if (!quickText) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parts = (quickResult as any)?.response?.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
                quickText = parts
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
                    .join('');
            }
        }
        thought = stripFillerSentenceStarts(extractThoughtText(String(quickText || ''))).trim();
    } catch (quickThoughtErr) {
        console.warn(
            'image_thought_only: Gemini failed; returning fallback thought',
            quickThoughtErr,
        );
    }

    const wrappedThought = thought || FALLBACK_THOUGHT;
    if (wantsStream) {
        const wrapped = `<thought>${wrappedThought}</thought>`;
        return new Response(
            new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    const inner = extractPartialThoughtInner(wrapped);
                    if (inner) {
                        controller.enqueue(
                            encoder.encode(
                                `${JSON.stringify({ type: 'thought', text: inner })}\n`,
                            ),
                        );
                    }
                    controller.enqueue(
                        encoder.encode(
                            `${JSON.stringify({ type: 'complete', full: wrapped })}\n`,
                        ),
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
            },
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
