/**
 * Shared image utility constants and functions used by the diagnosis pipeline.
 *
 * Extracted here to avoid duplication between:
 *   - src/app/api/diagnose/helpers.ts
 *   - src/app/api/diagnose/image-loader.ts
 *   - src/app/api/diagnoses/[id]/refine/route.ts
 */

/** Image URLs are fetched server-side — restrict to known-safe origins to prevent SSRF. */
export const ALLOWED_IMAGE_ORIGINS = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
].filter((s): s is string => typeof s === 'string' && s.length > 0);

/** Gemini Flash prices images at a flat token rate, not by byte size. */
export const MAX_DIAGNOSE_IMAGE_BYTES = 4 * 1024 * 1024;

/** Hard cap on images in a single /api/diagnose request. */
export const MAX_DIAGNOSE_IMAGES = 4;

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
