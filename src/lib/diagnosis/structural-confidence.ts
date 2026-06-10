/**
 * Structural confidence — Phase 4.
 *
 * Replaces routing-by-self-reported-confidence with a deterministic score
 * computed from observable signals about the request and the agent output.
 *
 * The model's `confidence` integer still flows through the pipeline for
 * analytics and comparison work, but it is no longer the value that gates
 * provider surfacing — see `shouldShowProvidersForDiagnosis` in
 * `diagnosis-confidence.ts`.
 *
 * Signal table (kept aligned with the Phase 4 spec):
 *
 *   Base:                                                  50
 *   At least 1 image provided:                            +15
 *   2 or more images provided:                            +5  (extra)
 *   Description >= 25 words:                              +10
 *   Description >= 60 words:                              +5  (extra)
 *   subcategory_id is NOT none_unmapped:                  +15
 *   failed_component is non-empty:                        +10
 *   trade === "General Handyman" AND 0 images:            -15
 *   trade === "N/A" OR rejected OR unserviced:            score forced to 0
 *
 * Clamped to [0, 100] and rounded to an integer.
 */

import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import { TAXONOMY_NONE_ID } from '@/lib/diagnosis/diagnosis-trade-taxonomy';

/** Provider-surfacing threshold for the deterministic score. */
export const STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD = 70;

/** Future Phase 5 helper — kept as a type alias today so the data shape stays stable. */
export type TextImageAgreement = 'agree' | 'partial' | 'conflict' | 'unknown';

export interface StructuralConfidenceSignals {
    hasImage: boolean;
    imageCount: number;
    descriptionWordCount: number;
    subcategoryMatched: boolean;
    failedComponentNamed: boolean;
    isCatchAllWithNoVisual: boolean;
    isRejectedOrUnserviced: boolean;
}

export interface StructuralConfidence {
    /** Deterministic 0–100 score. */
    score: number;
    signals: StructuralConfidenceSignals;
    /**
     * Human-readable explanation of each signal that contributed to the score.
     * Compute-time only — not persisted into the diagnosis JSON.
     */
    drivers: string[];
}

function countWords(text: string | null | undefined): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeStructuralConfidence(input: {
    classification: ClassificationResult;
    imageCount: number;
    descriptionText: string | null | undefined;
    failedComponent: string | null | undefined;
}): StructuralConfidence {
    const { classification, imageCount, descriptionText, failedComponent } = input;
    const wordCount = countWords(descriptionText);
    const tradeLower = (classification.trade || '').toLowerCase();
    const isCatchAllWithNoVisual = tradeLower === 'general handyman' && imageCount === 0;
    const isRejectedOrUnserviced =
        Boolean(classification.rejected) ||
        Boolean(classification.unserviced) ||
        tradeLower === 'n/a';

    const subcategoryMatched = Boolean(
        classification.subcategory_id && classification.subcategory_id !== TAXONOMY_NONE_ID,
    );
    const failedComponentNamed = Boolean(
        typeof failedComponent === 'string' && failedComponent.trim().length > 0,
    );

    if (isRejectedOrUnserviced) {
        return {
            score: 0,
            signals: {
                hasImage: imageCount > 0,
                imageCount,
                descriptionWordCount: wordCount,
                subcategoryMatched,
                failedComponentNamed,
                isCatchAllWithNoVisual,
                isRejectedOrUnserviced: true,
            },
            drivers: [
                'Diagnosis is rejected, unserviced, or trade unresolved — score forced to 0.',
            ],
        };
    }

    let score = 50;
    const drivers: string[] = ['Base score: 50'];

    if (imageCount >= 1) {
        score += 15;
        drivers.push('At least one image provided: +15');
    }
    if (imageCount >= 2) {
        score += 5;
        drivers.push('Multiple images provided: +5');
    }
    if (wordCount >= 25) {
        score += 10;
        drivers.push('Description has 25+ words: +10');
    }
    if (wordCount >= 60) {
        score += 5;
        drivers.push('Description has 60+ words: +5');
    }
    if (subcategoryMatched) {
        score += 15;
        drivers.push('Taxonomy subcategory matched: +15');
    }
    if (failedComponentNamed) {
        score += 10;
        drivers.push('Specific failed component identified: +10');
    }
    if (isCatchAllWithNoVisual) {
        score -= 15;
        drivers.push('Catch-all trade with no visual evidence: -15');
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
        score,
        signals: {
            hasImage: imageCount > 0,
            imageCount,
            descriptionWordCount: wordCount,
            subcategoryMatched,
            failedComponentNamed,
            isCatchAllWithNoVisual,
            isRejectedOrUnserviced: false,
        },
        drivers,
    };
}

// TODO(phase-5): When the optional DIAGNOSIS_DOUBLE_CLASSIFY two-pass agreement
// check is added, surface its result as an additional driver entry here and
// fold the agreement state into the persisted signals shape.
