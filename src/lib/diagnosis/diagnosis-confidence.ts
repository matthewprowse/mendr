/**
 * Minimum model confidence (0–100) required before showing recommended providers in the UI.
 * Override at build time: NEXT_PUBLIC_DIAGNOSIS_MIN_CONFIDENCE=80
 */
export const DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS = ((): number => {
    const raw =
        typeof process.env.NEXT_PUBLIC_DIAGNOSIS_MIN_CONFIDENCE === 'string'
            ? process.env.NEXT_PUBLIC_DIAGNOSIS_MIN_CONFIDENCE.trim()
            : '';
    if (!raw) return 85;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 85;
})();
