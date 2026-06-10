/**
 * Read EXIF Orientation (tag 0x0112) from a HEIC/HEIF buffer, and translate
 * the resulting value (1-8) into the rotate + flip ops we hand to sharp.
 *
 * Why this exists:
 *   - `heic-convert` decodes HEIC pixels and produces a JPEG with no EXIF.
 *     iPhones store the photo at sensor orientation and rely on the EXIF
 *     Orientation tag to indicate display rotation. After heic-convert,
 *     that tag is gone, so the JPEG is sideways.
 *   - `sharp` cannot DECODE HEIC pixels on every platform (libvips usually
 *     ships without libheif). But it CAN read HEIC metadata — including the
 *     embedded EXIF buffer — through the heif metadata branch.
 *
 * Strategy: read the EXIF block via sharp's metadata, parse the TIFF IFD0
 * Orientation tag by hand (no extra dep), then return rotate-degrees +
 * flip flags. The route applies them via sharp on the JPEG output.
 *
 * EXIF Orientation values (per the spec — TIFF tag 0x0112):
 *   1 = top-left           — no transform
 *   2 = top-right          — mirror horizontal
 *   3 = bottom-right       — rotate 180°
 *   4 = bottom-left        — mirror vertical
 *   5 = left-top           — mirror horizontal + rotate 270° CW
 *   6 = right-top          — rotate 90° CW
 *   7 = right-bottom       — mirror horizontal + rotate 90° CW
 *   8 = left-bottom        — rotate 270° CW (equiv: 90° CCW)
 */

import sharp from 'sharp';

/**
 * Read the EXIF Orientation tag from a HEIC buffer. Returns the raw 1-8 value,
 * or 1 (no transform) on any parse error or when the tag is missing.
 *
 * This deliberately never throws — orientation is "best effort" enhancement.
 * If we can't read it, we ship the unrotated JPEG (current behaviour) rather
 * than failing the whole conversion.
 */
export async function readHeicOrientation(input: Buffer): Promise<number> {
    try {
        const meta = await sharp(input, { failOnError: false }).metadata();
        const exif = meta.exif;
        if (!exif || exif.length < 12) return 1;
        return parseOrientationFromExifBuffer(exif);
    } catch {
        return 1;
    }
}

/**
 * Parse the EXIF buffer that sharp returns for image metadata.
 *
 * The buffer format is:
 *   bytes 0-5: ASCII header "Exif\0\0" (some encoders include it, some don't)
 *   then TIFF: byte-order ("II" little-endian or "MM" big-endian) (2 bytes),
 *              magic 0x002a (2 bytes), IFD0 offset (4 bytes), then the IFDs.
 *
 * IFD0 entry layout (12 bytes each):
 *   0-1: tag id
 *   2-3: type
 *   4-7: count
 *   8-11: value (or offset if value > 4 bytes)
 *
 * Orientation is tag 0x0112, type SHORT (3), count 1, so the value sits in
 * bytes 8-9 of the entry.
 */
export function parseOrientationFromExifBuffer(exif: Buffer): number {
    // Strip the "Exif\0\0" prefix if present.
    const header = exif.subarray(0, 6).toString('ascii');
    const body = header === 'Exif\0\0' ? exif.subarray(6) : exif;
    if (body.length < 8) return 1;

    const byteOrder = body.subarray(0, 2).toString('ascii');
    const little = byteOrder === 'II';
    const big = byteOrder === 'MM';
    if (!little && !big) return 1;

    const read16 = (o: number) =>
        little ? body.readUInt16LE(o) : body.readUInt16BE(o);
    const read32 = (o: number) =>
        little ? body.readUInt32LE(o) : body.readUInt32BE(o);

    // Validate TIFF magic 0x002a.
    const magic = read16(2);
    if (magic !== 0x002a) return 1;

    const ifd0Offset = read32(4);
    if (ifd0Offset + 2 > body.length) return 1;
    const nEntries = read16(ifd0Offset);

    for (let i = 0; i < nEntries; i++) {
        const entryOffset = ifd0Offset + 2 + i * 12;
        if (entryOffset + 12 > body.length) break;
        const tag = read16(entryOffset);
        if (tag === 0x0112) {
            const value = read16(entryOffset + 8);
            // Constrain to the valid 1-8 range.
            if (value >= 1 && value <= 8) return value;
            return 1;
        }
    }
    return 1;
}

/**
 * Map an EXIF orientation value (1-8) to the operations sharp needs to apply
 * in order to present the image upright.
 *
 * Note on order: when we hand these to sharp, we apply flop/flip BEFORE
 * rotate. EXIF semantics define the mirror as happening first, then the
 * rotation — so do the same here.
 */
export function orientationToSharpRotate(
    orientation: number,
): { rotateDegrees: 0 | 90 | 180 | 270; flipHorizontal: boolean; flipVertical: boolean } {
    switch (orientation) {
        case 1: return { rotateDegrees: 0, flipHorizontal: false, flipVertical: false };
        case 2: return { rotateDegrees: 0, flipHorizontal: true, flipVertical: false };
        case 3: return { rotateDegrees: 180, flipHorizontal: false, flipVertical: false };
        case 4: return { rotateDegrees: 0, flipHorizontal: false, flipVertical: true };
        case 5: return { rotateDegrees: 270, flipHorizontal: true, flipVertical: false };
        case 6: return { rotateDegrees: 90, flipHorizontal: false, flipVertical: false };
        case 7: return { rotateDegrees: 90, flipHorizontal: true, flipVertical: false };
        case 8: return { rotateDegrees: 270, flipHorizontal: false, flipVertical: false };
        default: return { rotateDegrees: 0, flipHorizontal: false, flipVertical: false };
    }
}
