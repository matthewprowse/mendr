import { NextRequest } from 'next/server';
import type { Content as GeminiContent } from '@google/generative-ai';
import { GEMINI_MODEL_NAME, getDiagnosisModel } from '@/lib/ai-diagnosis-backend';
import { logAiEvent } from '@/lib/ai-logging';
import { logIfDiagnosisJsonShapeUnexpected } from './diagnosis-json-validate';
import { DIAGNOSE_PROMPT_VERSION } from './prompts/prompt-version';
import { checkRateLimit, isRateLimitBypassed } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { getServiceCatalogLabelsCached } from '@/lib/service-catalog-server';
import { normalizeProvidersForPrompt } from '@/lib/diagnose-prompt-providers';
import { buildSystemInstruction } from './prompts';
import { buildProviderHydrationPromptBlock } from './prompts/provider-hydration';
import {
    buildUnrelatedImageMessage,
    buildUnsupportedHomeServiceMessage,
} from './prompts/special-cases';

// Image URLs are fetched server-side — restrict to known-safe origins to prevent SSRF.
const ALLOWED_IMAGE_ORIGINS = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
].filter((s): s is string => typeof s === 'string' && s.length > 0);
const MAX_DIAGNOSE_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB guardrail for model payload cost.
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
    console.log(
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

function injectDiagnosisMetadata(text: string): string {
    const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (!jsonMatch?.[1]) return text;
    try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        parsed.prompt_version = DIAGNOSE_PROMPT_VERSION;
        parsed.ai_model = GEMINI_MODEL_NAME;
        logIfDiagnosisJsonShapeUnexpected(parsed);
        const replaced = `<json>${JSON.stringify(parsed)}</json>`;
        return text.replace(jsonMatch[0], replaced);
    } catch {
        return text;
    }
}

function applyDiagnosePostProcess(fullText: string, serviceList: string[]): string {
    const withThought = enforceThoughtSentenceCount(
        enforceMinThoughtLength(ensureThoughtBlock(fullText), 125),
        2,
        3
    );
    const withThoughtStyle = withThought.replace(
        /<thought>([\s\S]*?)<\/thought>/i,
        (_m, t) => `<thought>${stripFillerSentenceStarts(String(t || ''))}</thought>`
    );
    return injectDiagnosisMetadata(
        enforceUrgencyKey(
            enforceLanguageStyleInJson(
                enforceUnsupportedHomeServiceResponse(
                    enforceUnrelatedImageResponse(
                        enforceTradeFromServiceCatalog(withThoughtStyle, serviceList)
                    ),
                    serviceList
                )
            )
        )
    );
}

export async function POST(req: NextRequest) {
    const timings: Record<string, number> = {};
    const requestStartedAt = Date.now();
    // ── Rate limit ─────────────────────────────────────────────────────────────
    const rateLimitStageStartedAt = Date.now();
    const limited = checkRateLimit(req, 'diagnose');
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

    if (isFirstMessage && !disableDiagnosisQuota) {
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
    // eslint-disable-next-line no-console
    console.log('POST /api/diagnose received request');
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
                  estimated_cost?: string;
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

        const hasUserContext = userSelectedTrade?.trade && userSelectedTrade?.diagnosis;
        const model = getDiagnosisModel();

        if (analysisPhase === 'image_thought_only') {
            const imageParts: ContentPart[] = [];
            if (typeof image === 'string' && image.trim()) {
                const inline = await imageStringToInlineData(image.trim());
                if (inline) imageParts.push(inline);
            }
            for (const att of attachmentImages) {
                const base64Data = att.split(',')[1];
                const mimeType = att.split(';')[0].split(':')[1];
                if (base64Data && mimeType) {
                    imageParts.push({ inlineData: { data: base64Data, mimeType } });
                }
            }
            if (imageParts.length === 0) {
                return new Response(
                    JSON.stringify({ error: 'No image available for analysis.' }),
                    { status: 400 }
                );
            }

            const quickPrompt =
                `Analyse ${imageParts.length > 1 ? 'these images' : 'this image'} and return only a short <thought> block (1-2 sentences) describing what is visibly wrong and likely issue pattern. ` +
                `Do not include JSON or extra sections.`;
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
                'Visible signs suggest a likely home maintenance issue pattern that needs a closer diagnosis.';

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
                                } catch (e) {
                                    controller.error(e);
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

            const quickResult = await model.generateContent({
                contents: quickContents,
                generationConfig: quickGenerationConfig,
            });
            const quickResp = (quickResult as any)?.response;
            let quickText = quickResp && typeof quickResp.text === 'function' ? quickResp.text() : '';
            if (!quickText) {
                const parts = (quickResult as any)?.response?.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts)) {
                    quickText = parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('');
                }
            }
            const thought = stripFillerSentenceStarts(extractThoughtText(String(quickText || ''))).trim();
            if (wantsStream) {
                const wrapped = `<thought>${thought || fallbackThought}</thought>`;
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
            return new Response(`<thought>${thought || fallbackThought}</thought>`, {
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
            return new Response(
                JSON.stringify({
                    error: 'Service catalog is unavailable. Please retry shortly.',
                }),
                { status: 503 }
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
            providers: providersForPrompt,
            previousDiagnosis: prevDiagForHydration ?? previousDiagnosis,
            diagnosisRejected,
        });

        const userOriginalWordsHydration = (
            typeof textQuery === 'string' ? textQuery : ''
        ).trim();
        const hydrationAppendix =
            isProviderHydration && prevDiagForHydration
                ? `\n\n${buildProviderHydrationPromptBlock(userOriginalWordsHydration, prevDiagForHydration)}`
                : '';
        const instructionPrefix = `${systemInstruction.trim()}${hydrationAppendix}\n\n`;

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
                      `The user selected "${userSelectedTrade.diagnosis}" (${userSelectedTrade.trade}) as their preferred service, but this is only a hint. If their description clearly indicates a different trade, set diagnosis, trade, and trade_detail to the more accurate trade.

The user described their issue:

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
            const imagePrompt = isProviderHydration && !history?.length
                ? instructionPrefix +
                  userWordsPriority +
                  `PROVIDER HYDRATION PASS: Re-read ${imageParts.length > 1 ? 'these images' : 'this image'} and output a full Scandio response. Follow PROVIDER HYDRATION TURN in your instructions; keep established diagnosis fields stable unless clearly wrong.

CRITICAL: Output <thought> FIRST (2–3 short sentences), then </thought>, then <json>. Never skip the thought block.`
                : !history?.length
                  ? hasUserContext
                      ? instructionPrefix +
                        userWordsPriority +
                        `The user selected "${userSelectedTrade.diagnosis}" (${userSelectedTrade.trade}) as a preferred service, but it is not authoritative. If their words or the image clearly indicate a different trade, set diagnosis, trade, trade_detail, and action_required to the more accurate trade. Analyse quickly.

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
            temperature: isProviderHydration ? 0.22 : 0.35,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 2048,
        };

        try {
            // eslint-disable-next-line no-console
            console.log('Starting Gemini stream generation...');
            const streamStageStartedAt = Date.now();
            const result = await model.generateContentStream({
                contents: contents as unknown as GeminiContent[],
                generationConfig,
            });
            recordStage(timings, 'gemini_stream_start_ms', streamStageStartedAt);

            if (wantsStream) {
                return new Response(
                    new ReadableStream({
                        async start(controller) {
                            const encoder = new TextEncoder();
                            const emit = (o: unknown) =>
                                controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));
                            let accum = '';
                            let lastThought = '';
                            try {
                                // eslint-disable-next-line no-console
                                console.log('Awaiting first chunk from Gemini (NDJSON stream)...');
                                for await (const chunk of result.stream) {
                                    const text = chunk.text();
                                    if (!text) continue;
                                    accum += text;
                                    const inner = extractPartialThoughtInner(accum);
                                    if (inner !== null && inner !== lastThought) {
                                        lastThought = inner;
                                        emit({ type: 'thought', text: inner });
                                    }
                                }
                                const adjusted = applyDiagnosePostProcess(accum, serviceList);
                                emit({ type: 'complete', full: adjusted });
                                // eslint-disable-next-line no-console
                                console.log('Gemini NDJSON stream completed successfully');
                            } catch (e) {
                                console.error('Error during Gemini NDJSON stream iteration:', e);
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
                    }
                );
            }

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
                }),
            });
            logDiagnoseTimings('ok', timings);

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
                        const adjusted = applyDiagnosePostProcess(fullText, serviceList);
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
                    ...DIAGNOSE_RESPONSE_META_HEADERS,
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

            const fallbackStageStartedAt = Date.now();
            const result = await model.generateContent({
                contents: contents as unknown as GeminiContent[],
                generationConfig,
            });
            recordStage(timings, 'gemini_generate_content_fallback_ms', fallbackStageStartedAt);

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
                    usedGenerateContentFallback: true,
                }),
            });
            logDiagnoseTimings('ok', timings);

            const adjusted = applyDiagnosePostProcess(fullText, serviceList);

            if (wantsStream) {
                const thoughtInner =
                    extractPartialThoughtInner(adjusted) ?? extractThoughtText(adjusted) ?? '';
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            const encoder = new TextEncoder();
                            if (thoughtInner.trim()) {
                                controller.enqueue(
                                    encoder.encode(
                                        `${JSON.stringify({ type: 'thought', text: thoughtInner })}\n`
                                    )
                                );
                            }
                            controller.enqueue(
                                encoder.encode(`${JSON.stringify({ type: 'complete', full: adjusted })}\n`)
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

            return new Response(adjusted, {
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
