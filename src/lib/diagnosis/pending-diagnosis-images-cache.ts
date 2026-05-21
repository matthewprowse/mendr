const pendingDiagnosisImages = new Map<string, string[]>();

export function setPendingDiagnosisImages(conversationId: string, imageUrls: string[]): void {
    const key = conversationId.trim();
    if (!key) return;
    const cleaned = imageUrls
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    pendingDiagnosisImages.set(key, cleaned);
}

export function getPendingDiagnosisImages(conversationId: string): string[] {
    const key = conversationId.trim();
    if (!key) return [];
    const value = pendingDiagnosisImages.get(key);
    return Array.isArray(value) ? [...value] : [];
}

export function clearPendingDiagnosisImages(conversationId: string): void {
    const key = conversationId.trim();
    if (!key) return;
    pendingDiagnosisImages.delete(key);
}
