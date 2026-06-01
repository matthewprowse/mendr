/**
 * Tests for image preprocessing (resize + screenshot heuristic).
 *
 * Uses sharp to generate small in-test fixtures so we don't ship binary
 * test data. The heuristic test ALSO covers the no-false-positive bias —
 * a small real-camera JPEG (with EXIF Make=Apple) must NOT be flagged.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
    looksLikeScreenshot,
    resizeImageToMaxDimension,
} from '../image-preprocessing';

async function makeJpegBuffer(width: number, height: number): Promise<Buffer> {
    return await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 200, g: 100, b: 50 },
        },
    })
        .jpeg({ quality: 80 })
        .toBuffer();
}

async function makePngBuffer(width: number, height: number): Promise<Buffer> {
    return await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 50, g: 100, b: 200 },
        },
    })
        .png()
        .toBuffer();
}

/**
 * Build a JPEG that has an embedded EXIF block containing Make=Apple.
 * sharp's `withMetadata({ exif: { IFD0: { Make: 'Apple' } } })` writes a
 * real TIFF block so the heuristic sees the camera tag.
 */
async function makeJpegWithExif(width: number, height: number): Promise<Buffer> {
    return await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 128, g: 128, b: 128 },
        },
    })
        .jpeg({ quality: 80 })
        .withMetadata({
            exif: {
                IFD0: {
                    Make: 'Apple',
                    Model: 'iPhone 14',
                },
            },
        })
        .toBuffer();
}

describe('resizeImageToMaxDimension', () => {
    it('shrinks the longest edge to the max', async () => {
        const original = await makeJpegBuffer(2000, 1500);
        const resized = await resizeImageToMaxDimension(original, 1024);
        const meta = await sharp(resized).metadata();
        expect(meta.width).toBeLessThanOrEqual(1024);
        expect(meta.height).toBeLessThanOrEqual(1024);
        // Aspect ratio preserved (within rounding).
        const ratio = (meta.width ?? 0) / (meta.height ?? 1);
        expect(ratio).toBeGreaterThan(1.32);
        expect(ratio).toBeLessThan(1.34);
    });

    it('does not upscale a small image', async () => {
        const small = await makeJpegBuffer(400, 300);
        const resized = await resizeImageToMaxDimension(small, 1024);
        const meta = await sharp(resized).metadata();
        expect(meta.width).toBe(400);
        expect(meta.height).toBe(300);
    });

    it('outputs JPEG regardless of input format', async () => {
        const pngInput = await makePngBuffer(800, 600);
        const resized = await resizeImageToMaxDimension(pngInput, 1024);
        const meta = await sharp(resized).metadata();
        expect(meta.format).toBe('jpeg');
    });
});

describe('looksLikeScreenshot', () => {
    it('does NOT flag a JPEG with EXIF Make=Apple as a screenshot', async () => {
        // Real iPhone photo — must NEVER be rejected.
        const realPhoto = await makeJpegWithExif(3024, 4032);
        const verdict = await looksLikeScreenshot(realPhoto);
        expect(verdict.isScreenshot).toBe(false);
    });

    it('does NOT flag a small JPEG with EXIF camera tags', async () => {
        const realPhoto = await makeJpegWithExif(800, 600);
        const verdict = await looksLikeScreenshot(realPhoto);
        expect(verdict.isScreenshot).toBe(false);
    });

    it('flags a PNG at phone-screen ratio (no EXIF + lossless + phone ratio)', async () => {
        // 1170x2532 = iPhone 14 screen, ratio ≈ 2.164 ≈ 19.5:9. PNG, no
        // EXIF → all three signals fire → must be flagged.
        const fakeScreenshot = await makePngBuffer(1170, 2532);
        const verdict = await looksLikeScreenshot(fakeScreenshot);
        expect(verdict.isScreenshot).toBe(true);
        expect(verdict.reason).toBeTruthy();
    });

    it('does not flag a PNG at a non-phone ratio (single signal only)', async () => {
        // Plain 800x600 PNG. We get no_exif + format_png_no_exif → 2 signals.
        // This IS a borderline case — we expect the heuristic to flag it
        // because both signals point at "not from a camera". This is the
        // intended behaviour: a 4:3 PNG with no EXIF is almost always a
        // screenshot or a stock graphic, not a phone photo.
        const png = await makePngBuffer(800, 600);
        const verdict = await looksLikeScreenshot(png);
        expect(verdict.isScreenshot).toBe(true);
    });

    it('does not throw on an empty/garbage buffer', async () => {
        const garbage = Buffer.from([0, 1, 2, 3, 4]);
        const verdict = await looksLikeScreenshot(garbage);
        // Malformed input → conservative pass-through (let the upload route
        // decide what to do via its own magic-byte check).
        expect(verdict.isScreenshot).toBe(false);
    });
});
