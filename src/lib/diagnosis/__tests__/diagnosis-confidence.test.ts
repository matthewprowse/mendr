/**
 * Tests for diagnosis-confidence.ts — shouldShowProvidersForDiagnosis
 */

import { describe, it, expect } from 'vitest';
import {
    shouldShowProvidersForDiagnosis,
    DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS,
} from '../diagnosis-confidence';
import { STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD } from '../structural-confidence';
import type { DiagnosisData } from '@/features/diagnosis/types';

// ── Minimal valid DiagnosisData fixture ───────────────────────────────────────

function makeDiagnosis(overrides: Partial<DiagnosisData> = {}): DiagnosisData {
    return {
        trade: 'Electrical',
        message: 'DB board tripping',
        confidence: 90,
        rejected: false,
        unserviced: false,
        requires_clarification: false,
        ...overrides,
    } as DiagnosisData;
}

// ── shouldShowProvidersForDiagnosis ──────────────────────────────────────────

describe('shouldShowProvidersForDiagnosis — null/falsy inputs', () => {
    it('returns false for null', () => {
        expect(shouldShowProvidersForDiagnosis(null)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(shouldShowProvidersForDiagnosis(undefined)).toBe(false);
    });
});

describe('shouldShowProvidersForDiagnosis — rejection flags', () => {
    it('returns false when rejected is true', () => {
        expect(shouldShowProvidersForDiagnosis(makeDiagnosis({ rejected: true }))).toBe(false);
    });

    it('returns false when unserviced is true', () => {
        expect(shouldShowProvidersForDiagnosis(makeDiagnosis({ unserviced: true }))).toBe(false);
    });

    it('returns false when requires_clarification is true', () => {
        expect(shouldShowProvidersForDiagnosis(makeDiagnosis({ requires_clarification: true }))).toBe(false);
    });
});

describe('shouldShowProvidersForDiagnosis — trade validation', () => {
    it('returns false when trade is empty string', () => {
        expect(shouldShowProvidersForDiagnosis(makeDiagnosis({ trade: '' }))).toBe(false);
    });

    it('returns false when trade is N/A', () => {
        expect(shouldShowProvidersForDiagnosis(makeDiagnosis({ trade: 'N/A' }))).toBe(false);
    });

    it('returns false when trade is n/a (lowercase)', () => {
        expect(shouldShowProvidersForDiagnosis(makeDiagnosis({ trade: 'n/a' }))).toBe(false);
    });

    it('returns false when trade is whitespace only', () => {
        expect(shouldShowProvidersForDiagnosis(makeDiagnosis({ trade: '   ' }))).toBe(false);
    });
});

describe('shouldShowProvidersForDiagnosis — structural confidence path', () => {
    it('returns true when structural score is at or above threshold', () => {
        const diag = makeDiagnosis({
            structural_confidence: { score: STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD, signals: {} as never },
            confidence: 10, // low self-reported should be ignored
        });
        expect(shouldShowProvidersForDiagnosis(diag)).toBe(true);
    });

    it('returns false when structural score is below threshold', () => {
        const diag = makeDiagnosis({
            structural_confidence: { score: STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD - 1, signals: {} as never },
            confidence: 99,
        });
        expect(shouldShowProvidersForDiagnosis(diag)).toBe(false);
    });

    it('uses the structural score rather than self-reported when both present', () => {
        const highSelf = makeDiagnosis({
            structural_confidence: { score: 50, signals: {} as never }, // below threshold
            confidence: 99,
        });
        expect(shouldShowProvidersForDiagnosis(highSelf)).toBe(false);
    });
});

describe('shouldShowProvidersForDiagnosis — legacy self-reported confidence fallback', () => {
    it('returns true when self-reported confidence meets the historical threshold', () => {
        const diag = makeDiagnosis({
            structural_confidence: undefined,
            confidence: DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS,
        });
        expect(shouldShowProvidersForDiagnosis(diag)).toBe(true);
    });

    it('returns false when self-reported confidence is below the threshold', () => {
        const diag = makeDiagnosis({
            structural_confidence: undefined,
            confidence: DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS - 1,
        });
        expect(shouldShowProvidersForDiagnosis(diag)).toBe(false);
    });

    it('returns false when neither structural nor self-reported confidence is present', () => {
        const diag = makeDiagnosis({
            structural_confidence: undefined,
            confidence: undefined,
        });
        expect(shouldShowProvidersForDiagnosis(diag)).toBe(false);
    });
});

describe('DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS', () => {
    it('is a number between 0 and 100', () => {
        expect(typeof DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS).toBe('number');
        expect(DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS).toBeGreaterThanOrEqual(0);
        expect(DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS).toBeLessThanOrEqual(100);
    });
});
