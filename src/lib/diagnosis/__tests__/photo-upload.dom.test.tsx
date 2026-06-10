/**
 * Tests for the shared homeowner photo-upload pipeline.
 *
 * This is the "photo/HEIC upload flow" the audit called out. The pipeline:
 *   File → readAsDataUrl → (HEIC? POST /api/convert-heic) → compressImage →
 *   dataUrlToFile → SelectedPhoto, then uploadPhotoToStorage → /api/upload-image.
 *
 * compressImage is canvas-bound (no jsdom canvas) so it's mocked to a known
 * data URL; the HEIC conversion and storage endpoints are stubbed with MSW.
 * The pure helpers (isHeicLike, dataUrlToFile, readFileAsDataUrl) are exercised
 * directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';

// compressImage is canvas-bound; mock it to a fixed VALID base64 data URL so
// the downstream dataUrlToFile(atob(...)) succeeds. We assert the conversion
// wiring via the mock's call args, not the (mocked) output bytes.
const h = vi.hoisted(() => ({
    COMPRESSED: 'data:image/jpeg;base64,QUFBQQ==',
    compressImage: vi.fn(async (_dataUrl: string) => 'data:image/jpeg;base64,QUFBQQ=='),
}));
vi.mock('@/lib/image-compression', () => ({ compressImage: h.compressImage }));

import {
    isHeicLike,
    createSelectedPhotoId,
    readFileAsDataUrl,
    dataUrlToFile,
    normalizeSelectedPhoto,
    uploadPhotoToStorage,
} from '@/lib/diagnosis/photo-upload';

const jpeg = (name = 'roof.jpg') =>
    new File(['hello world'], name, { type: 'image/jpeg' });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('isHeicLike', () => {
    it('detects HEIC/HEIF by MIME type', () => {
        expect(isHeicLike(new File([], 'x', { type: 'image/heic' }))).toBe(true);
        expect(isHeicLike(new File([], 'x', { type: 'image/heif' }))).toBe(true);
    });

    it('detects HEIC/HEIF by file extension regardless of MIME', () => {
        expect(isHeicLike(new File([], 'IMG_0001.HEIC', { type: '' }))).toBe(true);
        expect(isHeicLike(new File([], 'photo.heif', { type: 'application/octet-stream' }))).toBe(
            true,
        );
    });

    it('returns false for ordinary JPEG/PNG', () => {
        expect(isHeicLike(jpeg())).toBe(false);
        expect(isHeicLike(new File([], 'a.png', { type: 'image/png' }))).toBe(false);
    });
});

describe('createSelectedPhotoId', () => {
    it('produces a non-empty timestamped id', () => {
        const id = createSelectedPhotoId();
        expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });
});

describe('readFileAsDataUrl', () => {
    it('reads a File into a base64 data URL', async () => {
        const url = await readFileAsDataUrl(jpeg());
        expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    });
});

describe('dataUrlToFile', () => {
    it('decodes a data URL into a File with the matching mime and extension', () => {
        const dataUrl = `data:image/png;base64,${btoa('PNGDATA')}`;
        const file = dataUrlToFile(dataUrl, 'roof.heic');
        expect(file.type).toBe('image/png');
        expect(file.name).toBe('roof.png');
    });

    it('defaults to jpeg when the mime is unrecognised', () => {
        const dataUrl = `data:application/octet-stream;base64,${btoa('x')}`;
        const file = dataUrlToFile(dataUrl);
        expect(file.type).toBe('application/octet-stream');
        expect(file.name).toBe('upload.jpg');
    });
});

describe('normalizeSelectedPhoto', () => {
    it('compresses a non-HEIC image without calling the conversion endpoint', async () => {
        let converted = false;
        server.use(
            http.post('/api/convert-heic', () => {
                converted = true;
                return HttpResponse.json({});
            }),
        );
        const photo = await normalizeSelectedPhoto(jpeg());
        expect(converted).toBe(false);
        expect(photo.status).toBe('ready');
        expect(photo.previewSrc).toBe(h.COMPRESSED);
        expect(photo.diagnosisSrc).toBe(photo.previewSrc);
        // compressImage was handed the raw (non-HEIC) image data URL.
        expect(h.compressImage).toHaveBeenCalledWith(
            expect.stringContaining('data:image/jpeg;base64,'),
        );
    });

    it('converts a HEIC image via /api/convert-heic before compressing', async () => {
        server.use(
            http.post('/api/convert-heic', () =>
                HttpResponse.json({ dataUrl: 'data:image/jpeg;base64,Q09OVkVSVEVE' }),
            ),
        );
        const photo = await normalizeSelectedPhoto(
            new File(['raw'], 'IMG.HEIC', { type: 'image/heic' }),
        );
        expect(photo.status).toBe('ready');
        // compressImage receives the CONVERTED JPEG data URL, not the HEIC bytes.
        expect(h.compressImage).toHaveBeenCalledWith('data:image/jpeg;base64,Q09OVkVSVEVE');
        expect(photo.previewSrc).toBe(h.COMPRESSED);
    });

    it('throws a friendly error when HEIC conversion fails', async () => {
        server.use(
            http.post('/api/convert-heic', () => new HttpResponse(null, { status: 500 })),
        );
        await expect(
            normalizeSelectedPhoto(new File(['raw'], 'IMG.HEIC', { type: 'image/heic' })),
        ).rejects.toThrow(/Could not convert HEIC image/);
    });

    it('throws when the conversion endpoint returns a non-image payload', async () => {
        server.use(
            http.post('/api/convert-heic', () => HttpResponse.json({ dataUrl: 'not-a-data-url' })),
        );
        await expect(
            normalizeSelectedPhoto(new File(['raw'], 'IMG.HEIF', { type: 'image/heif' })),
        ).rejects.toThrow(/Could not convert HEIC image/);
    });
});

describe('uploadPhotoToStorage', () => {
    it('returns the stored image URL on success', async () => {
        server.use(
            http.post('/api/upload-image', () =>
                HttpResponse.json({ imageUrl: 'https://cdn.test/uploads/x.jpg' }),
            ),
        );
        const url = await uploadPhotoToStorage(jpeg(), 'conv-1');
        expect(url).toBe('https://cdn.test/uploads/x.jpg');
    });

    it('returns null on a non-OK response', async () => {
        server.use(
            http.post('/api/upload-image', () => new HttpResponse(null, { status: 413 })),
        );
        expect(await uploadPhotoToStorage(jpeg(), 'conv-1')).toBeNull();
    });

    it('returns null when the response url is not an http URL', async () => {
        server.use(
            http.post('/api/upload-image', () => HttpResponse.json({ imageUrl: 'blob:local' })),
        );
        expect(await uploadPhotoToStorage(jpeg(), 'conv-1')).toBeNull();
    });

    it('returns null when the request throws', async () => {
        server.use(
            http.post('/api/upload-image', () => {
                throw new Error('network down');
            }),
        );
        expect(await uploadPhotoToStorage(jpeg(), 'conv-1')).toBeNull();
    });
});
