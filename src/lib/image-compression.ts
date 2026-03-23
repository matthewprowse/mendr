/**
 * File: image-compression.ts
 * Description: Client-side image compression utility to reduce payload size and AI costs.
 */

/**
 * Compresses an image data URL by resizing it and reducing its quality.
 * Optimised for faster uploads and AI processing while preserving diagnostic clarity.
 * @param dataUrl - The original base64 image data URL.
 * @param maxLongEdge - Maximum long-edge (width or height) of the compressed image (default 1280px).
 * @param quality - JPEG quality from 0 to 1 (default 0.84).
 * @returns A promise that resolves to the compressed base64 data URL.
 */
export async function compressImage(
    dataUrl: string,
    maxLongEdge = 1280,
    quality = 0.84
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
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
        };
        img.onerror = (err) => reject(err);
    });
}
