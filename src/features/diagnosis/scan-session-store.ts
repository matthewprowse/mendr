'use client';

const KEY = 'scandio_scan_session_handoff_v1';

export type ScanSessionHandoff = {
    conversationId: string;
    primaryAssetDataUrl?: string;
    initialPrompt?: string;
    selectedService?: string | null;
};

export function getScanSessionHandoff(): ScanSessionHandoff | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        const o = parsed as Record<string, unknown>;
        if (typeof o.conversationId !== 'string' || !o.conversationId.trim()) return null;
        return {
            conversationId: o.conversationId.trim(),
            primaryAssetDataUrl:
                typeof o.primaryAssetDataUrl === 'string' ? o.primaryAssetDataUrl : undefined,
            initialPrompt: typeof o.initialPrompt === 'string' ? o.initialPrompt : undefined,
            selectedService:
                typeof o.selectedService === 'string'
                    ? o.selectedService
                    : o.selectedService === null
                      ? null
                      : undefined,
        };
    } catch {
        return null;
    }
}

export function setScanSessionHandoff(payload: ScanSessionHandoff): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
        /* quota / private mode */
    }
}

export function clearScanSessionHandoff(): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}
