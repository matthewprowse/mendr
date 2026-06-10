import { describe, it, expect } from 'vitest';
import {
    computeStructuralConfidence,
    STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD,
} from '../structural-confidence';
import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import { TAXONOMY_NONE_ID } from '../diagnosis-trade-taxonomy';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeClassification(
    overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
    return {
        trade: 'Electrical',
        trade_detail: 'DB Board Tripping',
        subcategory_id: 'db_board_tripping',
        confidence: 80,
        rejected: false,
        requires_clarification: false,
        unserviced: false,
        refetch_providers: false,
        unsupported_reason: '',
        failed_component: '',
        cascading_damage: '',
        trade_candidates: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD', () => {
    it('is the documented 70 threshold', () => {
        expect(STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD).toBe(70);
    });
});

describe('computeStructuralConfidence — baseline', () => {
    it('returns the base score (50) for an empty input with no signals', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'Electrical',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 0,
            descriptionText: '',
            failedComponent: '',
        });

        expect(result.score).toBe(50);
        expect(result.signals.hasImage).toBe(false);
        expect(result.signals.imageCount).toBe(0);
        expect(result.signals.descriptionWordCount).toBe(0);
        expect(result.signals.subcategoryMatched).toBe(false);
        expect(result.signals.failedComponentNamed).toBe(false);
        expect(result.signals.isCatchAllWithNoVisual).toBe(false);
        expect(result.signals.isRejectedOrUnserviced).toBe(false);
        expect(result.drivers).toContain('Base score: 50');
    });
});

describe('computeStructuralConfidence — image signals', () => {
    it('adds +15 for the first image', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 1,
            descriptionText: '',
            failedComponent: '',
        });
        expect(result.score).toBe(65);
        expect(result.signals.hasImage).toBe(true);
    });

    it('adds +5 (extra) for a second image (total +20 above base)', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 2,
            descriptionText: '',
            failedComponent: '',
        });
        expect(result.score).toBe(70);
    });

    it('does not add additional points beyond two images', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 4,
            descriptionText: '',
            failedComponent: '',
        });
        expect(result.score).toBe(70);
        expect(result.signals.imageCount).toBe(4);
    });
});

describe('computeStructuralConfidence — description word count', () => {
    it('adds +10 once the description reaches 25 words', () => {
        const text = Array.from({ length: 25 }, () => 'word').join(' ');
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 0,
            descriptionText: text,
            failedComponent: '',
        });
        expect(result.score).toBe(60);
    });

    it('adds an extra +5 once the description reaches 60 words', () => {
        const text = Array.from({ length: 60 }, () => 'word').join(' ');
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 0,
            descriptionText: text,
            failedComponent: '',
        });
        expect(result.score).toBe(65);
    });

    it('does not credit descriptions shorter than 25 words', () => {
        const text = Array.from({ length: 10 }, () => 'word').join(' ');
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 0,
            descriptionText: text,
            failedComponent: '',
        });
        expect(result.score).toBe(50);
    });
});

describe('computeStructuralConfidence — classification signals', () => {
    it('adds +15 when subcategory_id is mapped (not none_unmapped)', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: 'db_board_tripping' }),
            imageCount: 0,
            descriptionText: '',
            failedComponent: '',
        });
        expect(result.score).toBe(65);
        expect(result.signals.subcategoryMatched).toBe(true);
    });

    it('adds +10 when failed_component is named', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 0,
            descriptionText: '',
            failedComponent: 'torsion spring',
        });
        expect(result.score).toBe(60);
        expect(result.signals.failedComponentNamed).toBe(true);
    });

    it('treats whitespace-only failed_component as not named', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({ subcategory_id: TAXONOMY_NONE_ID }),
            imageCount: 0,
            descriptionText: '',
            failedComponent: '   ',
        });
        expect(result.signals.failedComponentNamed).toBe(false);
        expect(result.score).toBe(50);
    });
});

describe('computeStructuralConfidence — catch-all penalty', () => {
    it('subtracts 15 when trade is General Handyman with zero images', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'General Handyman',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 0,
            descriptionText: '',
            failedComponent: '',
        });
        expect(result.score).toBe(35);
        expect(result.signals.isCatchAllWithNoVisual).toBe(true);
    });

    it('does not subtract when General Handyman has at least one image', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'General Handyman',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 1,
            descriptionText: '',
            failedComponent: '',
        });
        // base 50 + image 15 = 65, no penalty.
        expect(result.score).toBe(65);
        expect(result.signals.isCatchAllWithNoVisual).toBe(false);
    });
});

describe('computeStructuralConfidence — rejected / unserviced / N/A', () => {
    it('forces score to 0 when rejected', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                rejected: true,
                trade: 'N/A',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 4,
            descriptionText: Array.from({ length: 200 }, () => 'word').join(' '),
            failedComponent: 'thing',
        });
        expect(result.score).toBe(0);
        expect(result.signals.isRejectedOrUnserviced).toBe(true);
    });

    it('forces score to 0 when unserviced', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                unserviced: true,
                trade: 'N/A',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 2,
            descriptionText: 'lots of words here that would add to the score normally',
            failedComponent: 'gearbox',
        });
        expect(result.score).toBe(0);
        expect(result.signals.isRejectedOrUnserviced).toBe(true);
    });

    it('forces score to 0 when trade is N/A', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'N/A',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 2,
            descriptionText: 'lots of words here that would add to the score normally',
            failedComponent: 'gearbox',
        });
        expect(result.score).toBe(0);
        expect(result.signals.isRejectedOrUnserviced).toBe(true);
    });
});

describe('computeStructuralConfidence — clamping', () => {
    it('caps the score at 100', () => {
        // base 50 + image 15 + image 5 + 25w 10 + 60w 5 + sub 15 + comp 10 = 110 → 100
        const text = Array.from({ length: 80 }, () => 'word').join(' ');
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'Electrical',
                subcategory_id: 'db_board_tripping',
            }),
            imageCount: 2,
            descriptionText: text,
            failedComponent: 'PCB board',
        });
        expect(result.score).toBe(100);
    });

    it('never returns a value below 0', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'General Handyman',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 0,
            descriptionText: '',
            failedComponent: '',
        });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });
});

describe('computeStructuralConfidence — composite real-world example', () => {
    it('returns a score that crosses the provider threshold for a strong signal', () => {
        const text =
            'My garage door spring snapped this morning. I can hear the motor running but the door is not moving. There is a loud bang noise when I press the remote.';
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'Security',
                trade_detail: 'Garage Door Fault',
                subcategory_id: 'garage_door_fault',
            }),
            imageCount: 2,
            descriptionText: text,
            failedComponent: 'torsion spring',
        });
        expect(result.score).toBeGreaterThanOrEqual(STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD);
    });

    it('keeps a weak signal below the provider threshold', () => {
        const result = computeStructuralConfidence({
            classification: makeClassification({
                trade: 'General Handyman',
                trade_detail: '',
                subcategory_id: TAXONOMY_NONE_ID,
            }),
            imageCount: 0,
            descriptionText: 'help',
            failedComponent: '',
        });
        expect(result.score).toBeLessThan(STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD);
    });
});
