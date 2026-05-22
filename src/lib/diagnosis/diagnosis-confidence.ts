import type { DiagnosisData } from '@/features/diagnosis/types';
import { STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD } from '@/lib/diagnosis/structural-confidence';

/**
 * Minimum model confidence (0–100) historically required before showing recommended providers.
 *
 * Still exported because the MODEL-facing prompts (see `prompts/output-format.ts`
 * and `prompts/followup.ts`) reference this value as the internal threshold the
 * model is asked to use when self-flagging `requires_clarification`. SERVER-side
 * routing no longer reads this constant — it goes through
 * `shouldShowProvidersForDiagnosis` instead.
 *
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

/**
 * Single source of truth for the "is this diagnosis confident enough to surface
 * contractors?" routing decision.
 *
 * Decision order:
 *   1. Rejected / unserviced / requires_clarification → never show providers.
 *   2. If a Phase 4 structural confidence score is present, gate on
 *      `score >= STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD`.
 *   3. Back-compat fallback for pre-Phase 4 rows: fall through to the
 *      self-reported `confidence` integer against the historical threshold.
 *
 * Replaces every direct `confidence >= DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS`
 * comparison previously sprinkled through the codebase.
 */
export function shouldShowProvidersForDiagnosis(
    diag: DiagnosisData | null | undefined,
): boolean {
    if (!diag) return false;
    if (diag.rejected) return false;
    if (diag.unserviced) return false;
    if (diag.requires_clarification) return false;

    const trade = (diag.trade ?? '').trim();
    if (!trade || trade.toLowerCase() === 'n/a') return false;

    const structuralScore = diag.structural_confidence?.score;
    if (typeof structuralScore === 'number' && Number.isFinite(structuralScore)) {
        return structuralScore >= STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD;
    }

    // Fallback: pre-Phase 4 rows (the 760 existing rows) still use the
    // self-reported confidence integer with the historical threshold.
    const selfReported = diag.confidence;
    if (typeof selfReported === 'number' && Number.isFinite(selfReported)) {
        return selfReported >= DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS;
    }

    return false;
}
