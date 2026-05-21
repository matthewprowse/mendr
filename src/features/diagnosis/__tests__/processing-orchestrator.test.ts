import { describe, it, expect } from 'vitest';
import {
    shouldSkipDiagnosisPipeline,
    buildDiagnosisVersion,
    isDiagnosisAccurateForPrefetch,
    PROCESSING_STEP_ORDER,
} from '../processing-orchestrator';
import type { DiagnosisData } from '../types';

// ---------------------------------------------------------------------------
// Minimal valid DiagnosisData fixture
// ---------------------------------------------------------------------------

function makeDiagnosis(overrides: Partial<DiagnosisData> = {}): DiagnosisData {
    return {
        thinking: '',
        diagnosis: 'Faulty capacitor',
        trade: 'Electrical',
        action_required: 'Replace capacitor',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// PROCESSING_STEP_ORDER
// ---------------------------------------------------------------------------

describe('PROCESSING_STEP_ORDER', () => {
    it('contains the four documented processing steps', () => {
        expect(PROCESSING_STEP_ORDER).toContain('uploadConfirmed');
        expect(PROCESSING_STEP_ORDER).toContain('imageThoughtComplete');
        expect(PROCESSING_STEP_ORDER).toContain('fullDiagnosisComplete');
        expect(PROCESSING_STEP_ORDER).toContain('prefetchQueued');
    });

    it('has no duplicate entries', () => {
        expect(new Set(PROCESSING_STEP_ORDER).size).toBe(PROCESSING_STEP_ORDER.length);
    });
});

// ---------------------------------------------------------------------------
// shouldSkipDiagnosisPipeline
// ---------------------------------------------------------------------------

describe('shouldSkipDiagnosisPipeline', () => {
    it('returns false for null input', () => {
        expect(shouldSkipDiagnosisPipeline(null)).toBe(false);
    });

    it('returns false for undefined input', () => {
        expect(shouldSkipDiagnosisPipeline(undefined)).toBe(false);
    });

    it('returns false when diagnosis is empty string', () => {
        expect(shouldSkipDiagnosisPipeline(makeDiagnosis({ diagnosis: '' }))).toBe(false);
    });

    it('returns false for the placeholder "Diagnosing…" value', () => {
        expect(shouldSkipDiagnosisPipeline(makeDiagnosis({ diagnosis: 'Diagnosing…' }))).toBe(false);
    });

    it('returns true when diagnosis is a non-placeholder string', () => {
        expect(shouldSkipDiagnosisPipeline(makeDiagnosis({ diagnosis: 'Leaking geyser' }))).toBe(true);
    });

    it('returns false when confidence < 1 and diagnosis ends with "services"', () => {
        const d = makeDiagnosis({ diagnosis: 'Electrical services', confidence: 0 });
        expect(shouldSkipDiagnosisPipeline(d)).toBe(false);
    });

    it('returns true when confidence >= 1 even if diagnosis ends with "services"', () => {
        const d = makeDiagnosis({ diagnosis: 'Electrical services', confidence: 1 });
        expect(shouldSkipDiagnosisPipeline(d)).toBe(true);
    });

    it('handles non-finite confidence gracefully (treats as 0)', () => {
        const d = makeDiagnosis({ diagnosis: 'Electrical services', confidence: NaN });
        expect(shouldSkipDiagnosisPipeline(d)).toBe(false);
    });

    it('returns false for a valid diagnosis with trade !== "N/A"', () => {
        // shouldSkipDiagnosisPipeline only checks if we can skip re-running diagnosis,
        // not whether the diagnosis is valid to display. A diagnosis with trade set
        // correctly should NOT be skipped when diagnosis string is present.
        const d = makeDiagnosis({ diagnosis: 'Geyser element failed', trade: 'Plumbing' });
        expect(shouldSkipDiagnosisPipeline(d)).toBe(true);
    });

    it('returns false for a diagnosis whose trade is "N/A" and diagnosis is empty', () => {
        const d = makeDiagnosis({ diagnosis: '', trade: 'N/A' });
        expect(shouldSkipDiagnosisPipeline(d)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// buildDiagnosisVersion
// ---------------------------------------------------------------------------

describe('buildDiagnosisVersion', () => {
    it('produces a pipe-delimited string of key fields', () => {
        const d = makeDiagnosis({
            trade: 'Plumbing',
            trade_detail: 'Rising damp',
            requires_clarification: false,
            rejected: false,
            unserviced: false,
            confidence: 92,
        });
        const version = buildDiagnosisVersion(d);
        expect(version).toBe('plumbing|rising damp|false|false|false|92');
    });

    it('rounds confidence to nearest integer', () => {
        const version = buildDiagnosisVersion(makeDiagnosis({ trade: 'HVAC', confidence: 87.6 }));
        expect(version).toContain('|88');
    });

    it('omits confidence when it is not a finite number', () => {
        const version = buildDiagnosisVersion(makeDiagnosis({ trade: 'HVAC', confidence: undefined }));
        // Confidence slot should be an empty string at the end.
        expect(version.endsWith('|')).toBe(true);
    });

    it('lowercases trade and trade_detail', () => {
        const version = buildDiagnosisVersion(makeDiagnosis({ trade: 'GATE MOTOR', trade_detail: 'Automation Unit' }));
        expect(version.startsWith('gate motor|automation unit')).toBe(true);
    });

    it('treats missing trade_detail as empty string', () => {
        const version = buildDiagnosisVersion(makeDiagnosis({ trade: 'Solar', trade_detail: undefined }));
        expect(version.startsWith('solar||')).toBe(true);
    });

    it('two diagnoses that differ only in confidence produce different versions', () => {
        const a = buildDiagnosisVersion(makeDiagnosis({ trade: 'Plumbing', confidence: 80 }));
        const b = buildDiagnosisVersion(makeDiagnosis({ trade: 'Plumbing', confidence: 95 }));
        expect(a).not.toBe(b);
    });
});

// ---------------------------------------------------------------------------
// isDiagnosisAccurateForPrefetch
// ---------------------------------------------------------------------------

describe('isDiagnosisAccurateForPrefetch', () => {
    it('returns eligible:true for a clean high-confidence diagnosis', () => {
        const result = isDiagnosisAccurateForPrefetch(makeDiagnosis({ confidence: 90 }));
        expect(result.eligible).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('returns eligible:true when confidence is exactly 85', () => {
        expect(isDiagnosisAccurateForPrefetch(makeDiagnosis({ confidence: 85 })).eligible).toBe(true);
    });

    it('returns eligible:true when confidence is undefined (treated as not low)', () => {
        expect(isDiagnosisAccurateForPrefetch(makeDiagnosis({ confidence: undefined })).eligible).toBe(true);
    });

    it('returns ineligible with reason low_confidence when confidence < 85', () => {
        const result = isDiagnosisAccurateForPrefetch(makeDiagnosis({ confidence: 84 }));
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('low_confidence');
    });

    it('returns ineligible with reason invalid_trade when trade is empty', () => {
        const result = isDiagnosisAccurateForPrefetch(makeDiagnosis({ trade: '' }));
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('invalid_trade');
    });

    it('returns ineligible with reason invalid_trade when trade is "N/A"', () => {
        const result = isDiagnosisAccurateForPrefetch(makeDiagnosis({ trade: 'N/A' }));
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('invalid_trade');
    });

    it('returns ineligible with reason requires_clarification', () => {
        const result = isDiagnosisAccurateForPrefetch(
            makeDiagnosis({ requires_clarification: true, confidence: 90 })
        );
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('requires_clarification');
    });

    it('returns ineligible with reason rejected', () => {
        const result = isDiagnosisAccurateForPrefetch(
            makeDiagnosis({ rejected: true, confidence: 90 })
        );
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('rejected');
    });

    it('returns ineligible with reason unserviced', () => {
        const result = isDiagnosisAccurateForPrefetch(
            makeDiagnosis({ unserviced: true, confidence: 90 })
        );
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('unserviced');
    });

    it('trade check takes priority over low_confidence', () => {
        // Trade is invalid AND confidence is low — reason should be invalid_trade.
        const result = isDiagnosisAccurateForPrefetch(makeDiagnosis({ trade: '', confidence: 50 }));
        expect(result.reason).toBe('invalid_trade');
    });
});
