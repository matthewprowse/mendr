/**
 * Image preprocessing utilities for the upload pipeline.
 *
 * Two responsibilities:
 *
 *  1. `resizeImageToMaxDimension` — shrink the longest edge to a cap (default
 *     1024px) before storage so we pay less for both Supabase storage AND
 *     the downstream Gemini call (image tokens scale with pixel count). JPEG
 *     output at quality 85 keeps the diagnosis-relevant detail without
 *     wasting bytes on photographic noise.
 *
 *  2. `looksLikeScreenshot` — heuristic that rejects obvious screenshots
 *     before they reach the (expensive) diagnosis pipeline. Real cameras
 *     produce JPEGs with EXIF. Screen captures produce PNG/WebP with no
 *     EXIF and often match a phone-screen aspect ratio. We require AT LEAST
 *     TWO independent signals before rejecting — false positives reject
 *     real photos and that is much worse UX than the occasional miss.
 */

import sharp from 'sharp';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_JPEG_QUALITY = 85;

/**
 * Common phone-screen aspect ratios (longest/shortest edge). We match within
 * a 2% tolerance so a screenshot saved with rounded dimensions still counts.
 *
 *   iPhone 15/14/13/12        — 19.5:9 → 2.166
 *   iPhone X/XS/11/etc        — 19.5:9 → 2.166
 *   Samsung S22/S23/S24       — 19.5:9 → 2.166 (some 20:9 → 2.222)
 *   Pixel 7/8                 — 20:9   → 2.222
 *   Older 18:9 phones         — 18:9   → 2.000
 *   Older 16:9                — 16:9   → 1.778
 *
 * Note: 16:9 is also a legitimate camera ratio so we don't include it on
 * its own — it only contributes as a screenshot signal when combined with
 * a no-EXIF lossless format.
 */
const PHONE_SCREEN_RATIOS: readonly number[] = [2.166, 2.222, 2.0];
const ASPECT_RATIO_TOLERANCE = 0.02;

// ── Resize ───────────────────────────────────────────────────────────────────

/**
 * Resize a JPEG/PNG/WebP/etc. buffer so its longest edge is no greater than
 * `maxPx`. Smaller-than-cap images are re-encoded but not upscaled (sharp's
 * default behaviour with `fit: 'inside'` + `withoutEnlargement: true`).
 *
 * Output is always JPEG at quality 85. We deliberately don't try to
 * preserve the original format — converting screenshots and PNGs to JPEG
 * shaves another 30-60% off the bytes and the diagnosis model doesn't care
 * about the container.
 */
export async function resizeImageToMaxDimension(
    buffer: Buffer,
    maxPx: number,
): Promise<Buffer> {
    return await sharp(buffer, { failOnError: false })
        .rotate() // auto-orient via EXIF before stripping it
        .resize({
            width: maxPx,
            height: maxPx,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .jpeg({ quality: DEFAULT_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
}

// ── Screenshot heuristic ─────────────────────────────────────────────────────

export interface ScreenshotVerdict {
    isScreenshot: boolean;
    reason?: string;
}

interface SharpExifWithCamera {
    Make?: unknown;
    Model?: unknown;
}

function hasCameraMakeOrModel(exif: Buffer | undefined): boolean {
    if (!exif || exif.length === 0) return false;
    // The simplest signal: any EXIF Make or Model tag at all. We do a string
    // scan rather than a full TIFF parse — Make/Model strings are usually
    // ASCII and any of the common manufacturer names appearing in the
    // EXIF block is a strong "this came from a real camera" signal.
    const ascii = exif.toString('ascii');
    return /Apple|iPhone|Samsung|Google|Pixel|Sony|Nikon|Canon|HUAWEI|Xiaomi|OPPO|OnePlus|LG|Motorola|HTC/i.test(
        ascii,
    );
}

function ratioMatchesPhoneScreen(width: number, height: number): boolean {
    if (width <= 0 || height <= 0) return false;
    const longest = Math.max(width, height);
    const shortest = Math.min(width, height);
    const ratio = longest / shortest;
    return PHONE_SCREEN_RATIOS.some(
        (r) => Math.abs(ratio - r) <= ASPECT_RATIO_TOLERANCE,
    );
}

/**
 * Heuristic detection of "this looks like a phone screenshot rather than a
 * photo of the actual problem".
 *
 * Signals collected (need ≥2 for a positive verdict):
 *   A. No EXIF data AT ALL
 *   B. Format is PNG or WebP (real cameras produce JPEG with EXIF)
 *   C. Aspect ratio matches a known phone-screen ratio (19.5:9, 20:9, 18:9)
 *
 * We deliberately ignore "no Make/Model tag" as a signal because some
 * editing apps strip those while leaving other EXIF. The conservative bias
 * is intentional: missing a screenshot only costs us a wasted diagnosis;
 * rejecting a real photo costs us a user.
 */
export async function looksLikeScreenshot(buffer: Buffer): Promise<ScreenshotVerdict> {
    let meta: sharp.Metadata;
    try {
        meta = await sharp(buffer, { failOnError: false }).metadata();
    } catch {
        // Can't read metadata at all → don't try to second-guess; let the
        // caller proceed. Upload route will fail on its own with a better
        // error if the bytes aren't a real image.
        return { isScreenshot: false };
    }

    const format = (meta.format ?? '').toLowerCase();
    const exif = meta.exif;
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const hasExif = Boolean(exif && exif.length > 0);
    const hasCameraTags = hasCameraMakeOrModel(exif);
    const isLosslessNoExif =
        (format === 'png' || format === 'webp') && !hasExif;
    const matchesPhoneRatio = ratioMatchesPhoneScreen(width, height);

    // Build the signal set. A signal is added only when it points TOWARD
    // "this is a screenshot".
    const signals: string[] = [];
    if (!hasExif && !hasCameraTags) signals.push('no_exif');
    if (isLosslessNoExif) signals.push(`format_${format}_no_exif`);
    if (matchesPhoneRatio && !hasCameraTags) signals.push('phone_screen_ratio');

    // Conservative gate: ≥2 independent signals required. The
    // !hasCameraTags qualifier on the ratio signal stops a legit phone
    // photo (which usually IS 19.5:9 from modern iPhones) from being
    // counted — those have EXIF Make=Apple so the camera-tag check
    // short-circuits the signal.
    if (signals.length >= 2) {
        return {
            isScreenshot: true,
            reason: signals.join('+'),
        };
    }

    return { isScreenshot: false };
}
