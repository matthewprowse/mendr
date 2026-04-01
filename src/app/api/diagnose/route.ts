import { NextRequest, NextResponse } from 'next/server';
import type { Content as GeminiContent } from '@google/generative-ai';
import { getGeminiModel } from '@/lib/ai-client';
import { logAiEvent } from '@/lib/ai-logging';
import { checkRateLimit, isRateLimitBypassed } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { buildSystemInstruction } from './prompts';
import {
    buildUnrelatedImageMessage,
    buildUnsupportedHomeServiceMessage,
} from './prompts/special-cases';

// Image URLs are fetched server-side — restrict to known-safe origins to prevent SSRF.
const ALLOWED_IMAGE_ORIGINS = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
].filter((s): s is string => typeof s === 'string' && s.length > 0);
const MAX_DIAGNOSE_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB guardrail for model payload cost.

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

function enforceMinThoughtLength(text: string, minChars = 125): string {
    const match = text.match(/<thought>([\s\S]*?)<\/thought>/i);
    if (!match) return text;

    const original = (match[1] ?? '').trim();
    if (original.length >= minChars) return text;

    const filler =
        ' Visible signs match this likely fault pattern, and the condition appears consistent across the observed area in this image.';
    let expanded = original;
    while (expanded.length < minChars) {
        expanded = (expanded + filler).trim();
    }
    expanded = expanded.slice(0, Math.max(minChars, expanded.length)).trim();

    return text.replace(match[0], `<thought>${expanded}</thought>`);
}

function ensureThoughtBlock(text: string): string {
    if (/<(?:thought|thinking|thought_process)\s*>[\s\S]*?<\/(?:thought|thinking|thought_process)\s*>/i.test(text)) {
        return text;
    }

    const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (!jsonMatch?.[1]) return text;

    try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        const imageDescriptions = Array.isArray(parsed?.image_descriptions)
            ? (parsed.image_descriptions as unknown[])
            : [];
        const firstImageDescription =
            typeof imageDescriptions[0] === 'string' ? imageDescriptions[0].trim() : '';
        const diagnosis = typeof parsed?.diagnosis === 'string' ? parsed.diagnosis.trim() : '';

        const seed =
            firstImageDescription ||
            diagnosis ||
            'Visible signs suggest a likely maintenance issue that matches the observed condition.';
        const thought = `<thought>${seed}</thought>\n`;
        return `${thought}${text}`;
    } catch {
        return text;
    }
}

function enforceThoughtSentenceCount(text: string, minSentences = 2, maxSentences = 3): string {
    const match = text.match(/<thought>([\s\S]*?)<\/thought>/i);
    if (!match) return text;

    const original = (match[1] ?? '').trim();
    if (!original) return text;

    const normalizeSentence = (s: string): string => {
        const trimmed = s.trim();
        if (!trimmed) return '';
        const withCapital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        return /[.!?]$/.test(withCapital) ? withCapital : `${withCapital}.`;
    };

    const sentences = original
        .split(/(?<=[.!?])\s+/)
        .map((s) => normalizeSentence(s))
        .filter(Boolean);

    if (sentences.length >= minSentences && sentences.length <= maxSentences) return text;

    const base = sentences[0] || 'Visible signs indicate a likely maintenance fault pattern.';
    const additions = [
        'Likely fault pattern matches the visible condition in the affected area.',
        'Overall condition appears consistent with one specific home maintenance issue.',
    ];

    const next = [...sentences];
    let addIndex = 0;
    while (next.length < minSentences) {
        next.push(additions[addIndex % additions.length]);
        addIndex += 1;
    }
    const trimmedToMax = next.slice(0, maxSentences);
    if (trimmedToMax.length === 1) {
        trimmedToMax.push(additions[0]);
    }
    if (trimmedToMax.length === 0) {
        trimmedToMax.push(base, additions[0]);
    }

    const rebuilt = trimmedToMax.join(' ').trim();
    return text.replace(match[0], `<thought>${rebuilt}</thought>`);
}

function enforceTradeFromServiceCatalog(text: string, serviceLabels: string[]): string {
    if (!Array.isArray(serviceLabels) || serviceLabels.length === 0) return text;
    const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (!jsonMatch?.[1]) return text;

    try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (!parsed || typeof parsed !== 'object') return text;

        const allowedLower = new Set(serviceLabels.map((s) => s.trim().toLowerCase()));
        const trade = typeof (parsed as any).trade === 'string' ? (parsed as any).trade.trim() : '';
        const tradeLower = trade.toLowerCase();
        const isAllowed = tradeLower === 'n/a' || allowedLower.has(tradeLower);
        if (isAllowed) return text;

        const next = {
            ...(parsed as any),
            trade: 'N/A',
            trade_detail: '',
            requires_clarification: true,
            unsupported_reason:
                typeof (parsed as any).unsupported_reason === 'string' &&
                (parsed as any).unsupported_reason.trim()
                    ? (parsed as any).unsupported_reason
                    : 'Mapped trade was not in the current supported services list.',
        };
        const replaced = `<json>${JSON.stringify(next)}</json>`;
        return text.replace(jsonMatch[0], replaced);
    } catch {
        return text;
    }
}

function enforceUnrelatedImageResponse(text: string): string {
    const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (!jsonMatch?.[1]) return text;
    try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        const rejected = Boolean(parsed.rejected);
        const unserviced = Boolean(parsed.unserviced);
        const isUnrelatedPhoto = rejected && !unserviced;
        if (!isUnrelatedPhoto) return text;

        const unrelatedMessage = buildUnrelatedImageMessage();

        const next = {
            ...parsed,
            diagnosis: 'Photo Not Related to Home Maintenance',
            estimated_diagnosis_sentence: 'Photo Not Related to Home Maintenance',
            trade: 'N/A',
            trade_detail: '',
            message: unrelatedMessage,
            action_required: unrelatedMessage,
            requires_clarification: true,
        };
        return text.replace(jsonMatch[0], `<json>${JSON.stringify(next)}</json>`);
    } catch {
        return text;
    }
}

function enforceUnsupportedHomeServiceResponse(text: string, serviceLabels: string[]): string {
    const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (!jsonMatch?.[1]) return text;
    try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        const rejected = Boolean(parsed.rejected);
        const unserviced = Boolean(parsed.unserviced);
        const trade = typeof parsed.trade === 'string' ? parsed.trade.trim().toLowerCase() : '';
        const isUnsupportedHomeService = unserviced || (!rejected && trade === 'n/a');
        if (!isUnsupportedHomeService) return text;

        const unsupportedMessage = buildUnsupportedHomeServiceMessage(serviceLabels);

        const next = {
            ...parsed,
            diagnosis: 'Service Not Currently Supported',
            estimated_diagnosis_sentence: 'Service Not Currently Supported',
            trade: 'N/A',
            trade_detail: '',
            message: unsupportedMessage,
            action_required: unsupportedMessage,
            requires_clarification: true,
        };
        return text.replace(jsonMatch[0], `<json>${JSON.stringify(next)}</json>`);
    } catch {
        return text;
    }
}

function toHeadlineStyle(input: string): string {
    const minor = new Set(['and', 'or', 'of', 'the', 'in', 'on', 'at', 'to', 'for', 'etc.']);
    const words = input
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return '';
    return words
        .map((w, i) => {
            const lower = w.toLowerCase();
            if (i > 0 && i < words.length - 1 && minor.has(lower)) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}

function stripFillerSentenceStarts(input: string): string {
    const fillers = /^[("'`\s-]*(a|an|the|this|it|there)\b[\s,:-]*/i;
    const sentences = input
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const fixed = sentences.map((s) => {
        let next = s.replace(fillers, '').trim();
        if (!next) return s;
        return next.charAt(0).toUpperCase() + next.slice(1);
    });
    return fixed.join(' ').trim();
}

function enforceLanguageStyleInJson(text: string): string {
    const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (!jsonMatch?.[1]) return text;
    try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        if (typeof parsed.diagnosis === 'string') {
            parsed.diagnosis = toHeadlineStyle(parsed.diagnosis);
        }
        if (typeof parsed.estimated_diagnosis_sentence === 'string') {
            parsed.estimated_diagnosis_sentence = toHeadlineStyle(parsed.estimated_diagnosis_sentence);
        } else if (typeof parsed.diagnosis === 'string') {
            parsed.estimated_diagnosis_sentence = parsed.diagnosis;
        }
        if (typeof parsed.trade_detail === 'string' && parsed.trade_detail.trim()) {
            parsed.trade_detail = toHeadlineStyle(parsed.trade_detail);
        } else if (typeof parsed.trade === 'string' && parsed.trade.trim()) {
            // Backward-compatible safety net: ensure trade_detail is always present.
            parsed.trade_detail = toHeadlineStyle(parsed.trade);
        }
        if (typeof parsed.action_required === 'string' && parsed.action_required.trim()) {
            parsed.action_required = stripFillerSentenceStarts(parsed.action_required);
        }
        const replaced = `<json>${JSON.stringify(parsed)}</json>`;
        return text.replace(jsonMatch[0], replaced);
    } catch {
        return text;
    }
}

function enforceUrgencyKey(text: string): string {
    const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (!jsonMatch?.[1]) return text;
    try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        const allowed = new Set(['immediate', 'urgent', 'soon', 'planned']);
        const current =
            typeof parsed.urgency_key === 'string'
                ? parsed.urgency_key.trim().toLowerCase()
                : '';
        parsed.urgency_key = allowed.has(current) ? current : 'soon';
        return text.replace(jsonMatch[0], `<json>${JSON.stringify(parsed)}</json>`);
    } catch {
        return text;
    }
}

export async function POST(req: NextRequest) {
    // ── Rate limit ─────────────────────────────────────────────────────────────
    const limited = checkRateLimit(req, 'diagnose');
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

    if (isFirstMessage && !disableDiagnosisQuota) {
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

            let currentCount = 0;
            if (quotaUserId) {
                const { data } = await admin
                    .from('diagnosis_usage')
                    .select('count')
                    .eq('user_id', quotaUserId)
                    .eq('date', today)
                    .maybeSingle();
                currentCount = (data as { count: number } | null)?.count ?? 0;
            } else {
                const { data } = await admin
                    .from('diagnosis_usage')
                    .select('count')
                    .eq('anonymous_key', quotaAnonKey)
                    .eq('date', today)
                    .maybeSingle();
                currentCount = (data as { count: number } | null)?.count ?? 0;
            }

            if (currentCount >= limit) {
                return new Response(
                    JSON.stringify({
                        error: 'quota_exceeded',
                        limit,
                        used: currentCount,
                        message: quotaUserId
                            ? `You have used all ${limit} diagnoses for today. Your quota resets at midnight.`
                            : `You have used all ${limit} free diagnoses for today. Sign in for more.`,
                    }),
                    { status: 429, headers: { 'Content-Type': 'application/json', ...quotaExtraHeaders } }
                );
            }

            // Increment — fire and forget; don't block the AI call
            const upsertRow = quotaUserId
                ? { user_id: quotaUserId, date: today, count: currentCount + 1 }
                : { anonymous_key: quotaAnonKey, date: today, count: currentCount + 1 };
            const onConflict = quotaUserId ? 'user_id,date' : 'anonymous_key,date';
            void admin.from('diagnosis_usage').upsert(upsertRow, { onConflict });
        } catch (quotaErr) {
            // Non-fatal: if the usage table doesn't exist yet or query fails, allow through
            console.warn('Quota check skipped (error):', quotaErr);
        }
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
    // eslint-disable-next-line no-console
    console.log('POST /api/diagnose received request');
    try {
        const body = await req.json();
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
        } = body;

        // ── Input guards ───────────────────────────────────────────────────────
        if (Array.isArray(history) && history.length > 20) {
            return new Response(
                JSON.stringify({ error: 'History too long. Maximum 20 turns allowed.' }),
                { status: 400 },
            );
        }
        if (Array.isArray(attachments) && attachments.length > 3) {
            return new Response(
                JSON.stringify({ error: 'Too many attachments. Maximum 3 images per request.' }),
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
            ? attachments.filter((a: unknown) => typeof a === 'string' && a.startsWith('data:'))
            : [];

        // Basic request-shape logging only; detailed metrics are captured at the end.
        // eslint-disable-next-line no-console
        console.log(
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
                if (approxBytes > MAX_DIAGNOSE_IMAGE_BYTES) return null;
                return { inlineData: { data: base64Data, mimeType } };
            }

            // Newer flow stores a public Supabase URL in `conversations.image_url`.
            try {
                const res = await fetch(img);
                if (!res.ok) return null;
                const mimeType = res.headers.get('content-type') || 'image/jpeg';
                const bytes = await res.arrayBuffer();
                if (bytes.byteLength > MAX_DIAGNOSE_IMAGE_BYTES) return null;
                const base64Data = arrayBufferToBase64(bytes);
                return { inlineData: { data: base64Data, mimeType } };
            } catch {
                return null;
            }
        };

        const isFollowUp = !!(history?.length && previousDiagnosis?.diagnosis);
        const hasUserContext = userSelectedTrade?.trade && userSelectedTrade?.diagnosis;
        const serviceList = Array.isArray(serviceCatalog)
            ? serviceCatalog.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim())
            : [];
        if (serviceList.length === 0) {
            return new Response(
                JSON.stringify({
                    error: 'Service catalog is required for diagnosis trade mapping.',
                }),
                { status: 400 }
            );
        }
        const serviceListText = serviceList.join(', ');
        const systemInstruction = buildSystemInstruction({
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
            providers,
            previousDiagnosis,
            diagnosisRejected,
        });

        const instructionPrefix = `${systemInstruction.trim()}\n\n`;

        // Gemini v1 doesn't accept the SDK-level `systemInstruction` field.
        // Embed the same instructions directly into the first user prompt text instead.
        const model = getGeminiModel();

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
                const formatReminder =
                    "\n\nCRITICAL: You MUST respond with <thought> then <json>. The JSON must be valid (no trailing commas, escape quotes). Put your answer in the 'message' field.";
                const finalParts: ContentPart[] = [];
                for (const att of attachmentImages) {
                    const base64Data = att.split(',')[1];
                    const mimeType = att.split(';')[0].split(':')[1];
                    if (base64Data && mimeType) {
                        finalParts.push({ inlineData: { data: base64Data, mimeType } });
                    }
                }
                const textPart = ((textQuery as string) || '').trim();
                if (textPart) {
                    finalParts.push({ text: instructionPrefix + textPart + formatReminder });
                } else if (finalParts.length > 0) {
                    finalParts.push({
                        text:
                            instructionPrefix +
                            'The user uploaded new images for you to analyse. CRITICAL: Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>.' +
                            formatReminder,
                    });
                }
                if (finalParts.length > 0) {
                    contents.push({ role: 'user', parts: finalParts });
                }
            } else {
                const textPrompt = hasUserContext
                    ? instructionPrefix +
                      `The user selected "${userSelectedTrade.diagnosis}" (${userSelectedTrade.trade}) and has described their issue:

"${(textQuery as string).trim()}"

Analyse this description considering their stated interest. Output <thought> (2–3 short sentences) then <json>.`
                    : instructionPrefix +
                      `The user has described their home maintenance issue:

"${(textQuery as string).trim()}"

Analyse this description and provide a diagnosis. Output <thought> (2–3 short sentences) then <json>.`;
                contents.push({ role: 'user', parts: [{ text: textPrompt }] });
            }
        } else {
            const imageParts: ContentPart[] = [];

            if (image) {
                const inline = await imageStringToInlineData(image);
                if (inline) imageParts.push(inline);
            }

            for (const att of attachmentImages) {
                const base64Data = att.split(',')[1];
                const mimeType = att.split(';')[0].split(':')[1];
                if (base64Data && mimeType) {
                    imageParts.push({
                        inlineData: { data: base64Data, mimeType },
                    });
                }
            }

            const hasImagesToAnalyse = imageParts.length > 0;
            const userTextQuery = (textQuery as string | undefined)?.trim() || '';
            /** First-image requests previously omitted textQuery entirely — user corrections were invisible to the model. */
            const userWordsPriority =
                userTextQuery.length > 0
                    ? `USER'S OWN WORDS ABOUT THE ISSUE (read first; if these disagree with a visual guess, trust the user on equipment type and job context):\n${JSON.stringify(userTextQuery)}\n\n`
                    : '';
            const imagePrompt = !history?.length
                ? hasUserContext
                    ? instructionPrefix +
                      userWordsPriority +
                      `The user selected "${userSelectedTrade.diagnosis}" (${userSelectedTrade.trade}) and has now uploaded ${imageParts.length > 1 ? 'these images' : 'this image'}. If their words above contradict that selection or the look of the photo (e.g. "it's a borehole pump not a pool pump", "actually irrigation"), you MUST set diagnosis, trade, trade_detail, and action_required to match what they said. Analyse quickly.

CRITICAL: Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>. Never skip the thought block.`
                    : instructionPrefix +
                      userWordsPriority +
                      `Analyse ${imageParts.length > 1 ? 'these images' : 'this image'}.

CRITICAL: Output <thought> FIRST (2–3 short sentences about the likely problem only in plain language). Never skip the thought block; the user sees it in real time.`
                : hasImagesToAnalyse
                  ? instructionPrefix +
                      `The user has uploaded new images for you to analyse.${userTextQuery ? ` Their message: "${userTextQuery}"` : ''} Provide a FULL diagnosis: identify the equipment/issue, set diagnosis, action_required, estimated_cost, and trade. Do NOT ask for clarification when the equipment is recognisable (e.g. gate motor, geyser, DB board) — diagnose it and recommend providers. Output <thought> FIRST (2–3 sentences), then </thought>, then <json>.`
                  : null;

            contents.push({
                role: 'user',
                parts: [...imageParts, ...(imagePrompt ? [{ text: imagePrompt }] : [])],
            });
        }

        const formatReminder =
            "\n\nCRITICAL: You MUST respond with <thought> then <json>. The JSON must be valid (no trailing commas, escape quotes). Put your answer in the 'message' field. Even for short questions like 'What?' or 'Are you sure?' — answer in message. If you cannot output valid JSON, use <message>Your answer</message> instead.";

        // Add history if present (image branch only; text-only builds full contents above). History is text-only — no image bytes.
        if (!isTextOnly && history && history.length > 0) {
            for (let i = 0; i < history.length; i++) {
                const msg = history[i] as HistoryMessage;
                const parts: ContentPart[] = [];
                let content = buildTextForMessage(msg);
                if (msg.role === 'user' && i === history.length - 1 && !isTextOnly) {
                    content += formatReminder;
                }
                if (content) parts.push({ text: content });
                if (parts.length > 0) {
                    contents.push({
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts,
                    });
                }
            }
        }

        const generationConfig = {
            temperature: 0.35,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 2048,
        };

        try {
            // eslint-disable-next-line no-console
            console.log('Starting Gemini stream generation...');
            const result = await model.generateContentStream({
                contents: contents as unknown as GeminiContent[],
                generationConfig,
            });

            const stream = new ReadableStream({
                async start(controller) {
                    const encoder = new TextEncoder();
                    try {
                        // eslint-disable-next-line no-console
                        console.log('Awaiting first chunk from Gemini...');
                        for await (const chunk of result.stream) {
                            const text = chunk.text();
                            controller.enqueue(encoder.encode(text));
                        }
                        // eslint-disable-next-line no-console
                        console.log('Gemini stream completed successfully');
                    } catch (e) {
                        console.error('Error during Gemini stream iteration:', e);
                        controller.error(e);
                    } finally {
                        controller.close();
                    }
                },
            });

            const durationMs = Date.now() - startedAt;
            logAiEvent({
                endpoint: 'diagnose',
                status: 'ok',
                durationMs,
                meta: {
                    isTextOnly,
                    isFollowUp,
                    hasUserContext,
                    hasImage: Boolean(image),
                    attachmentsCount: attachmentImages.length,
                    historyLength: Array.isArray(history) ? history.length : 0,
                    usedGenerateContentFallback: false,
                },
            });

            const adjustedStream = new ReadableStream({
                async start(controller) {
                    const reader = stream.getReader();
                    const decoder = new TextDecoder();
                    const encoder = new TextEncoder();
                    let fullText = '';
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            fullText += decoder.decode(value, { stream: true });
                        }
                        fullText += decoder.decode();
                        const withThought = enforceThoughtSentenceCount(
                            enforceMinThoughtLength(ensureThoughtBlock(fullText), 125),
                            2,
                            3
                        );
                        const withThoughtStyle = withThought.replace(
                            /<thought>([\s\S]*?)<\/thought>/i,
                            (_m, t) => `<thought>${stripFillerSentenceStarts(String(t || ''))}</thought>`
                        );
                        const adjusted = enforceUrgencyKey(enforceLanguageStyleInJson(
                            enforceUnsupportedHomeServiceResponse(
                                enforceUnrelatedImageResponse(
                                    enforceTradeFromServiceCatalog(withThoughtStyle, serviceList)
                                ),
                                serviceList
                            )
                        ));
                        controller.enqueue(encoder.encode(adjusted));
                    } catch (e) {
                        controller.error(e);
                    } finally {
                        reader.releaseLock();
                        controller.close();
                    }
                },
            });

            return new Response(adjustedStream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Transfer-Encoding': 'chunked',
                    ...quotaExtraHeaders,
                },
            });
        } catch (streamError: unknown) {
            // Some Gemini configurations/modes return 404 for `generateContentStream`.
            // Fallback to `generateContent()` so the UI still gets a full diagnosis response.
            const streamErrorMessage =
                streamError instanceof Error ? streamError.message : typeof streamError === 'string' ? streamError : '';

            // eslint-disable-next-line no-console
            console.warn('Gemini stream failed; falling back to generateContent:', streamErrorMessage);

            // If we are rate-limited / quota-exceeded, attempting the non-stream fallback costs another request.
            // Return immediately so clients can retry later (or show a useful message).
            const isQuotaOrRateLimit =
                /429\b/i.test(streamErrorMessage) ||
                streamErrorMessage.toLowerCase().includes('quota exceeded') ||
                streamErrorMessage.toLowerCase().includes('too many requests');
            if (isQuotaOrRateLimit) {
                return new Response(
                    JSON.stringify({
                        error:
                            process.env.NODE_ENV === 'development'
                                ? streamErrorMessage
                                : 'AI rate limit reached. Please try again shortly.',
                    }),
                    { status: 429 }
                );
            }

            const result = await model.generateContent({
                contents: contents as unknown as GeminiContent[],
                generationConfig,
            });

            const resp = (result as any)?.response;
            const fullTextFromResp = resp && typeof resp.text === 'function' ? resp.text() : '';
            const fullTextFromResult = (result as any) && typeof (result as any).text === 'function' ? (result as any).text() : '';

            let fullText = String(fullTextFromResp || fullTextFromResult || '').trim();

            if (!fullText) {
                // Best-effort extraction for SDK shapes where `response.text()` isn't present.
                const parts = (result as any)?.response?.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts)) {
                    fullText = parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
                }
            }

            if (!fullText) {
                throw streamError;
            }

            const durationMs = Date.now() - startedAt;
            logAiEvent({
                endpoint: 'diagnose',
                status: 'ok',
                durationMs,
                meta: {
                    isTextOnly,
                    isFollowUp,
                    hasUserContext,
                    hasImage: Boolean(image),
                    attachmentsCount: attachmentImages.length,
                    historyLength: Array.isArray(history) ? history.length : 0,
                    usedGenerateContentFallback: true,
                },
            });

            const withThought = enforceThoughtSentenceCount(
                enforceMinThoughtLength(ensureThoughtBlock(fullText), 125),
                2,
                3
            );
            const withThoughtStyle = withThought.replace(
                /<thought>([\s\S]*?)<\/thought>/i,
                (_m, t) => `<thought>${stripFillerSentenceStarts(String(t || ''))}</thought>`
            );
            const adjusted = enforceUrgencyKey(enforceLanguageStyleInJson(
                enforceUnsupportedHomeServiceResponse(
                    enforceUnrelatedImageResponse(
                        enforceTradeFromServiceCatalog(withThoughtStyle, serviceList)
                    ),
                    serviceList
                )
            ));
            return new Response(adjusted, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    ...quotaExtraHeaders,
                },
            });
        }
    } catch (error: unknown) {
        const durationMs = Date.now() - startedAt;
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
            meta: {
                error: metaError,
            },
        });
        // eslint-disable-next-line no-console
        console.error('Gemini Diagnosis Error:', error);
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
