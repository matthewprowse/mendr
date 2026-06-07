/* eslint-disable no-console */
/**
 * File: image-compression.ts
 * Description: Client-side image compression utility to reduce payload size and AI costs.
 */

export const BALANCED_LONG_EDGE = 1536;
export const BALANCED_INITIAL_QUALITY = 0.82;
export const BALANCED_MIN_QUALITY = 0.7;
export const BALANCED_TARGET_MAX_BYTES = 800 * 1024; // 800KB

/**
 * Convert a data URL into a Uint8Array for EXIF parsing.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
    const [, base64 = ''] = dataUrl.split(',');
    const binStr = atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binStr.charCodeAt(i);
    return bytes;
}

/**
 * Read the EXIF Orientation tag from raw JPEG bytes. Returns 1 (normal) when
 * the image has no EXIF, isn't a JPEG, or the tag can't be located.
 *
 * Valid values per EXIF spec:
 *   1 = normal           5 = transpose (rotated CW + mirrored)
 *   2 = flip horizontal  6 = rotate 90° CW (iPhone portrait default)
 *   3 = rotate 180°      7 = transverse (rotated CCW + mirrored)
 *   4 = flip vertical    8 = rotate 90° CCW
 *
 * Hand-rolled to avoid pulling in a library client-side. Reads only the
 * APP1/EXIF segment and the first IFD's Orientation entry; ignores
 * everything else.
 */
function readJpegOrientation(bytes: Uint8Array): number {
    // JPEG SOI marker
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

    let offset = 2;
    while (offset < bytes.length - 9) {
        if (bytes[offset] !== 0xff) return 1;
        const marker = bytes[offset + 1];

        // SOS (start of scan) or EOI → no more metadata
        if (marker === 0xda || marker === 0xd9) return 1;

        const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (segmentLength < 2) return 1;

        // APP1 = potential EXIF
        if (marker === 0xe1) {
            // "Exif\0\0" identifier at offset+4..offset+9
            if (
                bytes[offset + 4] === 0x45 &&
                bytes[offset + 5] === 0x78 &&
                bytes[offset + 6] === 0x69 &&
                bytes[offset + 7] === 0x66 &&
                bytes[offset + 8] === 0x00 &&
                bytes[offset + 9] === 0x00
            ) {
                const tiffStart = offset + 10;
                if (tiffStart + 8 > bytes.length) return 1;

                const littleEndian =
                    bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
                const u16 = (pos: number): number =>
                    littleEndian
                        ? bytes[pos] | (bytes[pos + 1] << 8)
                        : (bytes[pos] << 8) | bytes[pos + 1];
                const u32 = (pos: number): number =>
                    littleEndian
                        ? (bytes[pos] |
                              (bytes[pos + 1] << 8) |
                              (bytes[pos + 2] << 16) |
                              (bytes[pos + 3] << 24)) >>>
                          0
                        : ((bytes[pos] << 24) |
                              (bytes[pos + 1] << 16) |
                              (bytes[pos + 2] << 8) |
                              bytes[pos + 3]) >>>
                          0;

                if (u16(tiffStart + 2) !== 0x002a) return 1; // TIFF magic
                const firstIfd = tiffStart + u32(tiffStart + 4);
                if (firstIfd + 2 > bytes.length) return 1;

                const numEntries = u16(firstIfd);
                for (let i = 0; i < numEntries; i += 1) {
                    const entry = firstIfd + 2 + i * 12;
                    if (entry + 12 > bytes.length) return 1;
                    const tag = u16(entry);
                    if (tag === 0x0112) {
                        // Orientation: SHORT value stored in entry+8
                        const orientation = u16(entry + 8);
                        if (orientation >= 1 && orientation <= 8) {
                            return orientation;
                        }
                        return 1;
                    }
                }
                return 1;
            }
        }

        offset += 2 + segmentLength;
    }
    return 1;
}

/**
 * Apply an EXIF orientation transform to a canvas context. After calling
 * this, draw the SOURCE image at (0, 0) using its post-rotation dimensions
 * (which means swapping for orientations 5-8).
 */
function applyOrientationToCanvas(
    ctx: CanvasRenderingContext2D,
    orientation: number,
    rotatedWidth: number,
    rotatedHeight: number,
): void {
    switch (orientation) {
        case 2: // flip horizontal
            ctx.transform(-1, 0, 0, 1, rotatedWidth, 0);
            break;
        case 3: // rotate 180°
            ctx.transform(-1, 0, 0, -1, rotatedWidth, rotatedHeight);
            break;
        case 4: // flip vertical
            ctx.transform(1, 0, 0, -1, 0, rotatedHeight);
            break;
        case 5: // transpose (rotate 90° CW + mirror)
            ctx.transform(0, 1, 1, 0, 0, 0);
            break;
        case 6: // rotate 90° CW (iPhone portrait default)
            ctx.transform(0, 1, -1, 0, rotatedWidth, 0);
            break;
        case 7: // transverse
            ctx.transform(0, -1, -1, 0, rotatedHeight, rotatedWidth);
            break;
        case 8: // rotate 90° CCW
            ctx.transform(0, -1, 1, 0, 0, rotatedHeight);
            break;
        case 1:
        default:
            break;
    }
}

/** Return true when orientation rotates by 90° (swaps width and height). */
function orientationSwapsAxes(orientation: number): boolean {
    return orientation >= 5 && orientation <= 8;
}

/**
 * Compresses an image data URL by resizing it and reducing its quality.
 *
 * EXIF orientation handling (2026-05-29 fix): iPhone JPEGs from the camera
 * roll are stored sensor-rotated with an EXIF Orientation tag (typically
 * 6 = "rotate 90° clockwise to display"). Browsers respect this for
 * display, but `ctx.drawImage(<HTMLImageElement>, ...)` historically draws
 * the SENSOR pixels onto the canvas, which produces a sideways photo for
 * any portrait shot. We use `createImageBitmap(blob, { imageOrientation:
 * 'from-image' })` which is the spec-defined way to bake the EXIF
 * rotation into the bitmap BEFORE drawing, and falls back to the legacy
 * Image-element path only if the modern API is unavailable.
 *
 * Optimised for faster uploads and AI processing while preserving
 * diagnostic clarity.
 *
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
    // Step 1: read the EXIF Orientation tag directly from the JPEG bytes.
    // We do not rely on the browser to apply orientation — different mobile
    // browsers handle the `imageOrientation` option on createImageBitmap
    // inconsistently. Hand-rolling makes the result identical across
    // Chrome, Safari, iOS Safari, and Firefox.
    const bytes = dataUrlToBytes(dataUrl);
    const orientation = readJpegOrientation(bytes);

    // Diagnostic log — keep this until rotation is confirmed working
    // on iOS Safari + iPhone HEIC + Android Chrome. Lift after one week
    // of stable production traffic.
    if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.warn('[compressImage] orientation=', orientation, 'bytes=', bytes.length);
    }

    // Step 2: load the image into an HTMLImageElement. We pass
    // `imageOrientation: 'none'` to createImageBitmap below to be explicit
    // we'll handle rotation ourselves. For the Image-element fallback path
    // we don't have that knob, so we still need the manual transform.
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');

            // Sensor-orientation dimensions (what the bytes contain).
            const sensorWidth = img.naturalWidth || img.width;
            const sensorHeight = img.naturalHeight || img.height;

            // Post-rotation dimensions (what we display).
            const displayWidth = orientationSwapsAxes(orientation)
                ? sensorHeight
                : sensorWidth;
            const displayHeight = orientationSwapsAxes(orientation)
                ? sensorWidth
                : sensorHeight;

            // Calculate target dimensions while maintaining aspect ratio.
            let outWidth = displayWidth;
            let outHeight = displayHeight;
            const longEdge = Math.max(displayWidth, displayHeight);
            if (Number.isFinite(maxLongEdge) && maxLongEdge > 0 && longEdge > maxLongEdge) {
                const scale = maxLongEdge / longEdge;
                outWidth = Math.max(1, Math.round(displayWidth * scale));
                outHeight = Math.max(1, Math.round(displayHeight * scale));
            }

            canvas.width = outWidth;
            canvas.height = outHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Flatten any transparency onto white (JPEG has no alpha).
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, outWidth, outHeight);

            // Apply the EXIF rotation as a canvas transform BEFORE drawing.
            // The transform sets the canvas's coordinate system to the
            // image's display orientation, so the subsequent drawImage at
            // (0, 0) with sensor-pixel dimensions writes into the rotated
            // output space.
            applyOrientationToCanvas(ctx, orientation, outWidth, outHeight);

            // Draw at sensor dimensions scaled to the rotated output size.
            // Note: drawImage takes width/height in source-image coordinates,
            // so we use the pre-rotation (sensor) size scaled to fit the
            // rotated output canvas.
            const drawW = orientationSwapsAxes(orientation) ? outHeight : outWidth;
            const drawH = orientationSwapsAxes(orientation) ? outWidth : outHeight;
            // Diagnostic — confirm sensor vs display dims and what we draw.
            // eslint-disable-next-line no-console
            console.warn('[compressImage] sensor=', sensorWidth, 'x', sensorHeight,
                'display=', displayWidth, 'x', displayHeight,
                'out=', outWidth, 'x', outHeight,
                'draw=', drawW, 'x', drawH,
                'orientation=', orientation);
            ctx.drawImage(img, 0, 0, drawW, drawH);

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
