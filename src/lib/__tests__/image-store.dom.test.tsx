/**
 * Tests for the cross-page image store.
 *
 * It keeps a single pending diagnosis image in a module-level memory slot
 * (primary) with sessionStorage as a fallback that survives a full page
 * navigation. Pinned behaviours:
 *   - set writes BOTH memory and sessionStorage
 *   - get prefers memory, falls back to sessionStorage when memory is empty
 *   - a sessionStorage quota error during set is swallowed (memory still works)
 *   - clear wipes both layers
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('image-store', () => {
    it('writes to both memory and sessionStorage on set', async () => {
        const { setImageData } = await import('@/lib/image-store');
        setImageData('id-1', 'data:image/png;base64,AAAA', 'roof.png');
        const raw = sessionStorage.getItem('pending_diagnosis_image');
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw as string)).toEqual({
            id: 'id-1',
            dataUrl: 'data:image/png;base64,AAAA',
            fileName: 'roof.png',
        });
    });

    it('returns the in-memory value from get after a set', async () => {
        const { setImageData, getImageData } = await import('@/lib/image-store');
        setImageData('id-1', 'data:image/png;base64,AAAA', 'roof.png');
        expect(getImageData()).toEqual({
            id: 'id-1',
            dataUrl: 'data:image/png;base64,AAAA',
            fileName: 'roof.png',
        });
    });

    it('falls back to sessionStorage when memory is empty (fresh page load)', async () => {
        // Simulate a navigation: sessionStorage persists, module memory is fresh.
        sessionStorage.setItem(
            'pending_diagnosis_image',
            JSON.stringify({ id: 'id-2', dataUrl: 'data:x', fileName: 'a.jpg' }),
        );
        const { getImageData } = await import('@/lib/image-store');
        expect(getImageData()).toEqual({ id: 'id-2', dataUrl: 'data:x', fileName: 'a.jpg' });
    });

    it('returns null from get when neither layer has data', async () => {
        const { getImageData } = await import('@/lib/image-store');
        expect(getImageData()).toBeNull();
    });

    it('swallows a sessionStorage quota error but still serves from memory', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError');
        });
        const { setImageData, getImageData } = await import('@/lib/image-store');
        expect(() => setImageData('id-3', 'data:y', 'b.jpg')).not.toThrow();
        expect(getImageData()).toEqual({ id: 'id-3', dataUrl: 'data:y', fileName: 'b.jpg' });
    });

    it('clear wipes both memory and sessionStorage', async () => {
        const { setImageData, getImageData, clearImageData } = await import('@/lib/image-store');
        setImageData('id-4', 'data:z', 'c.jpg');
        clearImageData();
        expect(getImageData()).toBeNull();
        expect(sessionStorage.getItem('pending_diagnosis_image')).toBeNull();
    });

    it('returns null when sessionStorage holds malformed JSON and memory is empty', async () => {
        sessionStorage.setItem('pending_diagnosis_image', '{not valid json');
        const { getImageData } = await import('@/lib/image-store');
        expect(getImageData()).toBeNull();
    });
});
