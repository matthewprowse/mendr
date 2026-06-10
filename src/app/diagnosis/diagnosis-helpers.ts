/**
 * Pure helpers and module-scope constants for the /diagnosis client.
 * Extracted verbatim from client.tsx — no behavior change.
 */

export const DIAGNOSIS_MAX_RETRIES = 3;

/** Cap used by `truncateTitleTight`. Picked to comfortably fit the sticky
 *  header's `max-w-[60%]` slot on a typical phone without leaving the CSS
 *  `truncate` rule any work to do — which is what was producing the
 *  "Name …" (space before ellipsis) artefact when the browser's truncation
 *  boundary landed on a whitespace character. */
const STICKY_TITLE_MAX_CHARS = 32;

/** Pre-truncate a title before it reaches the DOM so the browser's
 *  `text-overflow: ellipsis` never has the chance to land on a trailing
 *  space and render "Name …" (with a visible gap). `trimEnd()` strips any
 *  whitespace that would otherwise sit between the last word and the
 *  ellipsis we append. */
export function truncateTitleTight(
    text: string,
    max: number = STICKY_TITLE_MAX_CHARS,
): string {
    const t = (text ?? "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max).trimEnd() + "…";
}
/** Title-case English number words for the clarification footer CTA. We spell
 *  out 1-9 ("Answer Three Questions") and fall back to the digit beyond. */
export function capitalisedNumberWord(n: number): string {
    const words = [
        "Zero",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
    ];
    return n >= 0 && n < words.length ? words[n] : String(n);
}
/** Inline header region (~pt-5 + h-11 + pb-2) for sticky title swap. */
export const HEADER_HEIGHT_PX = 72;
export const MIN_DESCRIPTION_CHARS = 25;

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const DEFAULT_MATCH_RADIUS_METERS = 10_000;
export function providerHydrateSessionKey(id: string): string {
    return `mendr_provider_hydrate_done:${id}`;
}

/** Single UX for unsupported trade and unrelated / non-maintenance photos (see `isServiceBlocked`). */
export const DIAGNOSIS_REJECT_HEADLINE = "We Can't Match This Job on Mendr Yet";
export const DIAGNOSIS_REJECT_DETAIL =
    "Either this does not look like a home repair or maintenance issue we can assess from your photo, or it is not a service on Mendr's list yet. Add a clearer photo or a few words about the job below, then tap Refresh Findings. If we still cannot match you, you will need to reach a specialist outside Mendr.";

/** Shared cap for photos attached to a diagnosis (existing + new in the
 *  refine overlay), matching the cap in the diagnose pipeline. */
export const REFINE_MAX_TOTAL_PHOTOS = 4;

export function isLikelyRenderableImageSource(value: string | null | undefined): boolean {
    const src = (value ?? "").trim();
    if (!src) return false;
    if (src.startsWith("data:image/")) return true;
    if (src.startsWith("blob:")) return true;
    if (/^https?:\/\//i.test(src)) {
        // Signed/public image URLs often include extension or image-transform path segments.
        return !/\/(start|processing|diagnosis|match|chat|report)(\/|$)/i.test(src);
    }
    return false;
}

function isHeicLikeDataUrl(value: string): boolean {
    return /^data:image\/hei[cf];/i.test(value.trim());
}

async function readBlobAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
                return;
            }
            reject(new Error("Could not read converted image."));
        };
        reader.onerror = () =>
            reject(reader.error ?? new Error("Could not read converted image."));
        reader.readAsDataURL(blob);
    });
}

// heic2any is loaded lazily on first HEIC conversion — keeps it out of the initial bundle.
async function convertHeicBlobToJpegDataUrl(blob: Blob): Promise<string> {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({
        blob,
        toType: "image/jpeg",
        quality: 0.9,
    });
    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
    if (!(convertedBlob instanceof Blob)) {
        throw new Error("Could not convert HEIC image.");
    }
    return readBlobAsDataUrl(convertedBlob);
}

export async function ensureRenderableImageSource(
    value: string | null,
): Promise<string | null> {
    const src = (value ?? "").trim();
    if (!src) return null;
    if (src.startsWith("blob:")) return src;
    if (!isHeicLikeDataUrl(src)) return src;
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        return await convertHeicBlobToJpegDataUrl(blob);
    } catch {
        return src;
    }
}

export const parseThoughtFromResponse = (text: string): string => {
    // Accept all known thought wrappers produced by the model.
    const tagged =
        text.match(
            /<(?:thought|thinking|thought_process)\s*>([\s\S]*?)<\/(?:thought|thinking|thought_process)\s*>/i,
        )?.[1] ??
        text.match(/```(?:thought|thinking)\s*([\s\S]*?)```/i)?.[1] ??
        "";
    if (tagged.trim()) return tagged.trim();

    // Fallback: if model emits plain text before JSON, treat it as thought.
    const jsonStart = text.search(/<json\s*>|\{[\s\n]*"[^"]*"\s*:\s*"/i);
    if (jsonStart > 0) {
        const beforeJson = text.slice(0, jsonStart).trim();
        const cleaned = beforeJson
            .replace(/^<(?:thought|thinking|thought_process)[^>]*>/i, "")
            .replace(/<\/?(?:thought|thinking|thought_process)\s*>/gi, "")
            .trim();
        if (cleaned.length > 0) return cleaned;
    }
    return "";
};

export const buildSelectedTradePayload = (selectedService: string | null) =>
    selectedService
        ? {
              userSelectedTrade: {
                  trade: selectedService,
                  diagnosis: `${selectedService} services`,
              },
          }
        : {};

export const toSentence = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return "";
    const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return /[.!?]$/.test(capped) ? capped : `${capped}.`;
};
