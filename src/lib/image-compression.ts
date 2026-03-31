/**
 * File: image-compression.ts
 * Description: Client-side image compression utility to reduce payload size and AI costs.
 */

export const BALANCED_LONG_EDGE = 1536;
export const BALANCED_INITIAL_QUALITY = 0.82;
export const BALANCED_MIN_QUALITY = 0.7;
export const BALANCED_TARGET_MAX_BYTES = 800 * 1024; // 800KB

/**
 * Compresses an image data URL by resizing it and reducing its quality.
 * Optimised for faster uploads and AI processing while preserving diagnostic clarity.
 * @param dataUrl - The original base64 image data URL.
 * @param maxLongEdge - Maximum long-edge (width or height) of the compressed image.
 * @param quality - Initial JPEG quality from 0 to 1.
 * @param maxBytes - Soft max target; quality will step down until below this size or minQuality is reached.
 * @param minQuality - Lowest quality allowed during iterative reduction.
 * @returns A promise that resolves to the compressed base64 data URL.
 */
export async function compressImage(
    dataUrl: string,
    maxLongEdge = BALANCED_LONG_EDGE,
    quality = BALANCED_INITIAL_QUALITY,
    maxBytes = BALANCED_TARGET_MAX_BYTES,
    minQuality = BALANCED_MIN_QUALITY
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            // Calculate new dimensions while maintaining aspect ratio.
            // Do not upscale: only resize when the long edge exceeds maxLongEdge.
            const longEdge = Math.max(width, height);
            if (Number.isFinite(maxLongEdge) && maxLongEdge > 0 && longEdge > maxLongEdge) {
                const scale = maxLongEdge / longEdge;
                width = Math.max(1, Math.round(width * scale));
                height = Math.max(1, Math.round(height * scale));
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Flatten any transparency onto white (JPEG has no alpha).
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Draw and compress (re-encoding strips metadata).
            ctx.drawImage(img, 0, 0, width, height);
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
            resolve(compressedDataUrl);
        };
        img.onerror = (err) => reject(err);
    });
}
