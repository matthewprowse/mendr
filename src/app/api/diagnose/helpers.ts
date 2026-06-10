/* eslint-disable no-console */
/**
 * Pure helpers for the /api/diagnose route. Extracted in Phase 2 so the
 * route handler stays a thin orchestrator and these utilities can be unit
 * tested without mocking Gemini/Supabase.
 *
 * Behaviour is preserved verbatim from the original inline implementations
 * in `route.ts` — these are mechanical extractions, not behavior changes.
 */

import { GEMINI_MODEL_NAME } from '@/lib/ai/ai-diagnosis-backend';
import { DIAGNOSE_PROMPT_VERSION } from '@/features/diagnosis/prompts/prompt-version';

/** Image URLs are fetched server-side — restrict to known-safe origins to prevent SSRF. */
export const ALLOWED_IMAGE_ORIGINS = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
].filter((s): s is string => typeof s === 'string' && s.length > 0);

/** Gemini Flash prices images at a flat token rate, not by byte size. */
export const MAX_DIAGNOSE_IMAGE_BYTES = 4 * 1024 * 1024;

/** Hard cap on images in a single /api/diagnose request. */
export const MAX_DIAGNOSE_IMAGES = 4;

/** Echoed on successful diagnosis responses for debugging; matches values embedded in <json>. */
export const DIAGNOSE_RESPONSE_META_HEADERS: Record<string, string> = {
    'X-Mendr-Prompt-Version': DIAGNOSE_PROMPT_VERSION,
    'X-Mendr-Ai-Model': GEMINI_MODEL_NAME,
};

export function diagnoseAiLogMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        promptVersion: DIAGNOSE_PROMPT_VERSION,
        model: GEMINI_MODEL_NAME,
        ...extra,
    };
}

export function recordStage(
    timings: Record<string, number>,
    key: string,
    startedAt: number,
): void {
    timings[key] = Date.now() - startedAt;
}

export interface DiagnoseLogMetaParams {
    isTextOnly: boolean;
    isFollowUp: boolean;
    hasUserContext: unknown;
    hasImage: boolean;
    attachmentCount: number;
    historyLength: number;
    pipeline: string;
    ndjsonStream?: boolean;
    tieringLogMeta: Record<string, unknown>;
}

/** Build the structured-log meta payload for a successful /api/diagnose call. */
export function buildDiagnoseSuccessMeta(
    params: DiagnoseLogMetaParams,
): Record<string, unknown> {
    return diagnoseAiLogMeta({
        isTextOnly: params.isTextOnly,
        isFollowUp: params.isFollowUp,
        hasUserContext: params.hasUserContext,
        hasImage: params.hasImage,
        attachmentsCount: params.attachmentCount,
        historyLength: params.historyLength,
        usedGenerateContentFallback: false,
        ...(params.ndjsonStream ? { ndjsonStream: true } : {}),
        pipeline: params.pipeline,
        ...params.tieringLogMeta,
    });
}

export function logDiagnoseTimings(
    status: 'ok' | 'error',
    timings: Record<string, number>,
): void {
    if (process.env.NODE_ENV !== 'development') return;
    console.warn(
        JSON.stringify({
            type: 'diagnose_timing',
            status,
            timings,
        }),
    );
}

/**
 * Build the 500-response shape emitted from the route's outer catch block.
 * Preserves the dev-mode error-detail surface vs production opaque message.
 */
export function buildDiagnoseErrorResponse(error: unknown): Response {
    const maybeErr = error as { message?: unknown; toString?: unknown };
    const metaError =
        typeof maybeErr.message === 'string'
            ? maybeErr.message
            : typeof maybeErr.toString === 'function'
              ? maybeErr.toString()
              : 'Unknown error';
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
        { status: 500 },
    );
}

export function extractErrorMessage(error: unknown): string {
    const maybeErr = error as { message?: unknown; toString?: unknown };
    if (typeof maybeErr.message === 'string') return maybeErr.message;
    if (typeof maybeErr.toString === 'function') {
        try {
            return maybeErr.toString();
        } catch {
            return 'Unknown error';
        }
    }
    return 'Unknown error';
}

/**
 * Whether the given URL is in the configured allow-list of origins from which
 * server-side image fetches are permitted. Data URIs always bypass this check
 * (they're not fetched). Used both as an early SSRF guard and during inline-
 * data resolution.
 */
export function isAllowedImageUrl(
    url: string,
    origins: readonly string[] = ALLOWED_IMAGE_ORIGINS,
): boolean {
    try {
        const parsed = new URL(url);
        return origins.some((origin) => parsed.origin === new URL(origin).origin);
    } catch {
        return false;
    }
}

/**
 * Extract the thought text from a complete Gemini response string. Looks for
 * `<thought>` / `<thinking>` / `<thought_process>` tags first, then a markdown
 * code-fence variant, then falls back to text before the JSON tag/object.
 */
export function extractThoughtText(responseText: string): string {
    const tagged =
        responseText.match(
            /<(?:thought|thinking|thought_process)\s*>([\s\S]*?)<\/(?:thought|thinking|thought_process)\s*>/i,
        )?.[1] ??
        responseText.match(/```(?:thought|thinking)\s*([\s\S]*?)```/i)?.[1] ??
        '';
    if (tagged.trim()) return tagged.trim();
    const beforeJson =
        responseText.split(/<json\s*>|\{[\s\n]*"[^"]*"\s*:\s*"/i)[0] ?? '';
    return beforeJson.trim();
}

/** Best-effort inner text of the thought tag while the model is still streaming. */
export function extractPartialThoughtInner(accum: string): string | null {
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

/**
 * Normalise the various legacy/new image fields into a single flat list of
 * strings (data URIs or http URLs), preserving the existing precedence order:
 *   1. `imageUrls: string[]`
 *   2. `images: string[]`
 *   3. `imageUrl` / `image` + optional `attachments[]`
 * Empty / non-string entries are filtered. Returns the raw list — callers
 * apply the `MAX_DIAGNOSE_IMAGES` cap separately so they can log truncations.
 */
export function normaliseDiagnoseImageInputs(body: {
    image?: unknown;
    imageUrl?: unknown;
    images?: unknown;
    imageUrls?: unknown;
    attachments?: unknown;
}): string[] {
    const { image, imageUrl, images, imageUrls, attachments } = body;
    if (Array.isArray(imageUrls)) {
        return (imageUrls as unknown[])
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((x) => x.trim());
    }
    if (Array.isArray(images)) {
        return (images as unknown[])
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((x) => x.trim());
    }
    const primarySource =
        typeof imageUrl === 'string' && imageUrl.trim()
            ? imageUrl.trim()
            : typeof image === 'string' && image.trim()
              ? image.trim()
              : null;
    const primary = primarySource ? [primarySource] : [];
    const extras = Array.isArray(attachments)
        ? (attachments as unknown[])
              .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
              .map((a) => a.trim())
        : [];
    return [...primary, ...extras];
}
