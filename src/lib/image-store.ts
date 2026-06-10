/* eslint-disable no-console */
/**
 * File: image-store.ts
 * Description: Storage utility for images between pages.
 * Uses an in-memory variable as primary and sessionStorage as fallback.
 */

type ImageData = {
    id: string;
    dataUrl: string;
    fileName: string;
};

let memoryStore: ImageData | null = null;

export const setImageData = (id: string, dataUrl: string, fileName: string) => {
    memoryStore = { id, dataUrl, fileName };
    try {
        sessionStorage.setItem(
            'pending_diagnosis_image',
            JSON.stringify({ id, dataUrl, fileName })
        );
    } catch (e) {
        console.warn('Session storage quota exceeded');
    }
};

export const getImageData = (): ImageData | null => {
    if (memoryStore) return memoryStore;

    try {
        const stored = sessionStorage.getItem('pending_diagnosis_image');
        if (stored) return JSON.parse(stored);
    } catch (e) {
        return null;
    }
    return null;
};

export const clearImageData = () => {
    memoryStore = null;
    try {
        sessionStorage.removeItem('pending_diagnosis_image');
    } catch (e) {}
};
