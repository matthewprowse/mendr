/**
 * Coarse region bucket for cache keys and query bias (Western Cape focus).
 */
export function inferRegionKeyFromAddress(address: string | null | undefined): 'wc' | 'za' {
    const a = (address ?? '').toLowerCase();
    if (!a.trim()) return 'wc';
    const wcHints =
        /\bwestern cape\b|\bwc\b|\bcape town\b|\bstellenbosch\b|\bpaarl\b|\bfranschhoek\b|\bhermanus\b|\bgeorge\b|\bknysna\b|\bboland\b|\bwinelands\b|\bellis\b|\bstrand\b|\bbrackenfell\b|\bdurbanville\b|\bblouberg\b|\bconstantia\b|\bobservatory\b|\bplumstead\b|\bclaremont\b|\bnewlands\b|\bsea point\b|\bgreen point\b|\bathlone\b|\bmitchells plain\b|\bkhayelitsha\b|\bpaarl\b|\bsomerset west\b|\bgordons bay\b/.test(
            a
        );
    if (wcHints) return 'wc';
    return 'za';
}
