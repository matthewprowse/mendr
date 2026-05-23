/**
 * Image → Gemini inline-data conversion for the /api/diagnose route.
 *
 * Extracted in Phase 2 from `route.ts` so the conversion can be unit tested
 * (data-URI path is fully pure; http path is testable via a `fetchImpl`
 * injection point).
 *
 * Behaviour matches the original inline implementation:
 *   - `data:<mime>;base64,...` URIs are decoded inline; payloads above the
 *     guardrail are dropped (returns null + console.warn).
 *   - Disallowed http origins return null (SSRF guard).
 *   - Allowed http origins are fetched; oversized payloads dropped; non-OK
 *     responses return null.
 *   - Network errors are swallowed (returns null).
 */

import { MAX_DIAGNOSE_IMAGE_BYTES, isAllowedImageUrl } from './helpers';

export interface InlineDataPart {
    inlineData: {
        data: string;
        mimeType: string;
    };
}

export type FetchImpl = (
    input: string,
    init?: RequestInit,
) => Promise<{
    ok: boolean;
    headers: { get(name: string): string | null };
    arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Works in both Node and browser-like runtimes. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
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
}

export async function imageStringToInlineData(
    img: string,
    deps?: {
        fetchImpl?: FetchImpl;
        allowedOrigins?: readonly string[];
        maxBytes?: number;
    },
): Promise<InlineDataPart | null> {
    const maxBytes = deps?.maxBytes ?? MAX_DIAGNOSE_IMAGE_BYTES;
    const fetchImpl = (deps?.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl)) as FetchImpl;

    if (img.startsWith('data:')) {
        const base64Data = img.split(',')[1];
        const mimeType = img.split(';')[0].split(':')[1];
        if (!base64Data || !mimeType) return null;
        const approxBytes = Math.floor((base64Data.length * 3) / 4);
        if (approxBytes > maxBytes) {
            console.warn(
                `[diagnose] image dropped — exceeds ${maxBytes / (1024 * 1024)}MB guardrail`,
                { approxBytes, mimeType },
            );
            return null;
        }
        return { inlineData: { data: base64Data, mimeType } };
    }

    if (img.startsWith('http')) {
        const allowed = deps?.allowedOrigins
            ? isAllowedImageUrl(img, deps.allowedOrigins)
            : isAllowedImageUrl(img);
        if (!allowed) return null;
    }

    try {
        const res = await fetchImpl(img);
        if (!res.ok) return null;
        const mimeType = res.headers.get('content-type') || 'image/jpeg';
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > maxBytes) {
            console.warn(
                `[diagnose] remote image dropped — exceeds ${maxBytes / (1024 * 1024)}MB guardrail`,
                { byteLength: bytes.byteLength, url: img.slice(0, 80) },
            );
            return null;
        }
        const base64Data = arrayBufferToBase64(bytes);
        return { inlineData: { data: base64Data, mimeType } };
    } catch {
        return null;
    }
}
