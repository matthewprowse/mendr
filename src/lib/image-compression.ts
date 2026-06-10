/**
 * File: image-compression.ts
 * Description: Client-side image compression utility to reduce payload size and AI costs.
 */

export const BALANCED_LONG_EDGE = 1536;
export const BALANCED_INITIAL_QUALITY = 0.82;
export const BALANCED_MIN_QUALITY = 0.7;
export const BALANCED_TARGET_MAX_BYTES = 800 * 1024; // 800KB

/**
 * Convert a base64 data: URL into a Blob without going through `fetch()`.
 * We build the Blob by hand because the app's CSP `connect-src` does not
 * allow the `data:` scheme — `fetch(dataUrl)` would be blocked.
 */
function dataUrlToBlob(dataUrl: string): Blob {
    const [meta, base64 = ''] = dataUrl.split(',');
    const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i += 1) bytes[i] = binStr.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

/**
 * Decode a data: URL into a drawable image with its EXIF orientation ALREADY
 * applied to the pixels.
 *
 * Why this matters: phone photos are stored sensor-rotated with an EXIF
 * Orientation tag (e.g. 6 = portrait, 3 = upside-down). We must NOT rotate by
 * hand. Every current browser already auto-orients via the default
 * `image-orientation: from-image`, so a manual canvas transform double-rotates
 * the image — portrait shots came out 90° sideways and 180° photos came out
 * upside down. `createImageBitmap(blob, { imageOrientation: 'from-image' })` is
 * the spec-defined way to bake the rotation into the bitmap before drawing; the
 * <img> fallback (e.g. Safari < 16.4, which ignores the option) is itself
 * auto-oriented by the browser. Either way the result is upright exactly once.
 */
async function decodeOriented(
    dataUrl: string,
): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(dataUrlToBlob(dataUrl), {
                imageOrientation: 'from-image',
            });
        } catch {
            // Fall through to the <img> path (option unsupported / decode failed).
        }
    }
    return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = dataUrl;
    });
}

/**
 * Compresses an image data URL by resizing it and reducing its quality.
 *
 * Orientation is handled entirely by the browser (see `decodeOriented`): the
 * image is already upright by the time we draw it, so the canvas applies no
 * manual rotation. Optimised for faster uploads and AI processing while
 * preserving diagnostic clarity.
 *
 * @param dataUrl - The original base64 image data URL.
 * @param maxLongEdge - Maximum long-edge (width or height) of the compressed image.
 * @param quality - Initial JPEG quality from 0 to 1.
 * @param maxBytes - Soft max target; quality steps down until below this size or minQuality is reached.
 * @param minQuality - Lowest quality allowed during iterative reduction.
 * @returns A promise that resolves to the compressed base64 data URL.
 */
export async function compressImage(
    dataUrl: string,
    maxLongEdge = BALANCED_LONG_EDGE,
    quality = BALANCED_INITIAL_QUALITY,
    maxBytes = BALANCED_TARGET_MAX_BYTES,
    minQuality = BALANCED_MIN_QUALITY,
): Promise<string> {
    const source = await decodeOriented(dataUrl);

    // Oriented (display) dimensions: HTMLImageElement exposes
    // naturalWidth/naturalHeight; ImageBitmap exposes width/height.
    const isImg = 'naturalWidth' in source;
    const srcW = (isImg ? source.naturalWidth : source.width) || 1;
    const srcH = (isImg ? source.naturalHeight : source.height) || 1;

    // Maintain aspect ratio while capping the long edge.
    let outWidth = srcW;
    let outHeight = srcH;
    const longEdge = Math.max(srcW, srcH);
    if (Number.isFinite(maxLongEdge) && maxLongEdge > 0 && longEdge > maxLongEdge) {
        const scale = maxLongEdge / longEdge;
        outWidth = Math.max(1, Math.round(srcW * scale));
        outHeight = Math.max(1, Math.round(srcH * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        if ('close' in source) source.close();
        throw new Error('Could not get canvas context');
    }

    // Flatten any transparency onto white (JPEG has no alpha).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outWidth, outHeight);
    // The source is already upright — draw it straight, no rotation.
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    if ('close' in source) source.close();

    const estimateBytes = (url: string) => {
        const base64 = url.split(',')[1] || '';
        return Math.floor((base64.length * 3) / 4);
    };

    let q = Math.min(1, Math.max(minQuality, quality));
    let compressedDataUrl = canvas.toDataURL('image/jpeg', q);
    while (estimateBytes(compressedDataUrl) > maxBytes && q > minQuality) {
        q = Math.max(minQuality, q - 0.05);
        compressedDataUrl = canvas.toDataURL('image/jpeg', q);
    }
    return compressedDataUrl;
}
