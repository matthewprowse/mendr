/**
 * Lightweight session handoff between `/welcome` and `/diagnosis/[id]`.
 * Stores only the minimum needed to bootstrap diagnosis for a conversation.
 */

export type ScanSessionHandoff = {
    conversationId: string;
    selectedService: string | null;
    primaryAssetDataUrl: string | null;
    initialPrompt: string;
};

const STORAGE_KEY = 'scan_session_handoff';

let memoryHandoff: ScanSessionHandoff | null = null;

export function setScanSessionHandoff(handoff: ScanSessionHandoff) {
    memoryHandoff = handoff;
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
        }
    } catch {
        // Ignore storage failures (e.g. quota, disabled storage)
    }
}

export function getScanSessionHandoff(): ScanSessionHandoff | null {
    if (memoryHandoff) return memoryHandoff;
    try {
        if (typeof window === 'undefined' || !window.sessionStorage) return null;
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ScanSessionHandoff;
        memoryHandoff = parsed;
        return parsed;
    } catch {
        return null;
    }
}

export function clearScanSessionHandoff() {
    memoryHandoff = null;
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Ignore
    }
}

