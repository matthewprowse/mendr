/**
 * File: image-compression.ts
 * Description: Client-side image compression utility to reduce payload size and AI costs.
 */

/**
 * Compresses an image data URL by resizing it and reducing its quality.
 * Optimised for faster uploads and AI processing while preserving diagnostic clarity.
 * @param dataUrl - The original base64 image data URL.
 * @param maxWidth - Maximum width of the compressed image (default 768px).
 * @param quality - JPEG quality from 0 to 1 (default 0.75).
 * @returns A promise that resolves to the compressed base64 data URL.
 */
export async function compressImage(
    dataUrl: string,
    maxWidth = 768,
    quality = 0.75
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions while maintaining aspect ratio
            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
        };
        img.onerror = (err) => reject(err);
    });
}
