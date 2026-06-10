import { describe, it, expect } from 'vitest';
import {
    parseOrientationFromExifBuffer,
    orientationToSharpRotate,
} from '../heic-orientation';

/**
 * Build a minimal valid EXIF buffer carrying a single Orientation entry in
 * IFD0. Used to exercise the parser without needing a real image file.
 *
 * Layout produced (little-endian):
 *   "Exif\0\0" (6) | "II" (2) | magic 0x002a (2) | ifd0Offset=8 (4)
 *   ifd0 nEntries=1 (2) | tag=0x0112 type=3 count=1 value=<orientation> (12)
 *   nextIfdOffset=0 (4)
 */
function buildExifWithOrientation(
    value: number,
    opts: { little?: boolean; withHeader?: boolean } = {},
): Buffer {
    const little = opts.little ?? true;
    const withHeader = opts.withHeader ?? true;

    const tiff = Buffer.alloc(2 + 2 + 4 + 2 + 12 + 4);
    let o = 0;
    tiff.write(little ? 'II' : 'MM', o, 'ascii'); o += 2;
    if (little) tiff.writeUInt16LE(0x002a, o); else tiff.writeUInt16BE(0x002a, o); o += 2;
    const ifd0Offset = 8;
    if (little) tiff.writeUInt32LE(ifd0Offset, o); else tiff.writeUInt32BE(ifd0Offset, o); o += 4;
    if (little) tiff.writeUInt16LE(1, o); else tiff.writeUInt16BE(1, o); o += 2; // nEntries
    if (little) tiff.writeUInt16LE(0x0112, o); else tiff.writeUInt16BE(0x0112, o); o += 2; // tag
    if (little) tiff.writeUInt16LE(3, o); else tiff.writeUInt16BE(3, o); o += 2; // type SHORT
    if (little) tiff.writeUInt32LE(1, o); else tiff.writeUInt32BE(1, o); o += 4; // count
    if (little) tiff.writeUInt16LE(value, o); else tiff.writeUInt16BE(value, o); o += 2; // value
    o += 2; // value field is 4 bytes; we used 2, leave 2 zero
    if (little) tiff.writeUInt32LE(0, o); else tiff.writeUInt32BE(0, o); // next IFD = 0

    if (!withHeader) return tiff;
    const header = Buffer.from('Exif\0\0', 'ascii');
    return Buffer.concat([header, tiff]);
}

describe('parseOrientationFromExifBuffer', () => {
    it('reads orientation 6 (rotate 90° CW) from a little-endian buffer with header', () => {
        const exif = buildExifWithOrientation(6);
        expect(parseOrientationFromExifBuffer(exif)).toBe(6);
    });

    it('reads orientation 6 from a big-endian buffer', () => {
        const exif = buildExifWithOrientation(6, { little: false });
        expect(parseOrientationFromExifBuffer(exif)).toBe(6);
    });

    it('reads orientation from a buffer with NO Exif\\0\\0 prefix', () => {
        const exif = buildExifWithOrientation(8, { withHeader: false });
        expect(parseOrientationFromExifBuffer(exif)).toBe(8);
    });

    it('returns 1 for an empty buffer', () => {
        expect(parseOrientationFromExifBuffer(Buffer.alloc(0))).toBe(1);
    });

    it('returns 1 when the buffer is too short to contain TIFF + IFD0', () => {
        expect(parseOrientationFromExifBuffer(Buffer.from('Exif\0\0II', 'ascii'))).toBe(1);
    });

    it('returns 1 when byte-order marker is invalid', () => {
        const bad = buildExifWithOrientation(6);
        bad[6] = 0x58; bad[7] = 0x58;
        expect(parseOrientationFromExifBuffer(bad)).toBe(1);
    });

    it('returns 1 when TIFF magic is wrong', () => {
        const bad = buildExifWithOrientation(6);
        bad[6 + 2] = 0xff;
        bad[6 + 3] = 0xff;
        expect(parseOrientationFromExifBuffer(bad)).toBe(1);
    });

    it('returns 1 when the orientation value is out of the 1-8 range', () => {
        const exif = buildExifWithOrientation(99);
        expect(parseOrientationFromExifBuffer(exif)).toBe(1);
    });

    it('returns 1 when IFD0 contains no Orientation entry', () => {
        // Build a manual IFD with a different tag (e.g. 0x0100 ImageWidth).
        const exif = buildExifWithOrientation(6);
        exif[6 + 10] = 0x00;
        exif[6 + 11] = 0x01;
        expect(parseOrientationFromExifBuffer(exif)).toBe(1);
    });
});

describe('orientationToSharpRotate', () => {
    it('1 — no transform', () => {
        expect(orientationToSharpRotate(1)).toEqual({
            rotateDegrees: 0, flipHorizontal: false, flipVertical: false,
        });
    });

    it('2 — mirror horizontal', () => {
        expect(orientationToSharpRotate(2)).toEqual({
            rotateDegrees: 0, flipHorizontal: true, flipVertical: false,
        });
    });

    it('3 — rotate 180', () => {
        expect(orientationToSharpRotate(3)).toEqual({
            rotateDegrees: 180, flipHorizontal: false, flipVertical: false,
        });
    });

    it('4 — mirror vertical', () => {
        expect(orientationToSharpRotate(4)).toEqual({
            rotateDegrees: 0, flipHorizontal: false, flipVertical: true,
        });
    });

    it('5 — mirror horizontal + rotate 270 CW', () => {
        expect(orientationToSharpRotate(5)).toEqual({
            rotateDegrees: 270, flipHorizontal: true, flipVertical: false,
        });
    });

    it('6 — rotate 90 CW (iPhone portrait case)', () => {
        expect(orientationToSharpRotate(6)).toEqual({
            rotateDegrees: 90, flipHorizontal: false, flipVertical: false,
        });
    });

    it('7 — mirror horizontal + rotate 90 CW', () => {
        expect(orientationToSharpRotate(7)).toEqual({
            rotateDegrees: 90, flipHorizontal: true, flipVertical: false,
        });
    });

    it('8 — rotate 270 CW', () => {
        expect(orientationToSharpRotate(8)).toEqual({
            rotateDegrees: 270, flipHorizontal: false, flipVertical: false,
        });
    });

    it('out-of-range values fall back to no-transform', () => {
        expect(orientationToSharpRotate(0)).toEqual({
            rotateDegrees: 0, flipHorizontal: false, flipVertical: false,
        });
        expect(orientationToSharpRotate(99)).toEqual({
            rotateDegrees: 0, flipHorizontal: false, flipVertical: false,
        });
    });
});
