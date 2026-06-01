/**
 * Diagnostic Accuracy Eval Suite — fixture shape.
 *
 * Phase 3 of `docs/Diagnostic-Accuracy-Hardening-Plan.md`.
 *
 * Each fixture represents a PATTERN that a homeowner might hit, not a
 * recording of a real production case. Real-world ground-truth fixtures
 * require contractor verification before `verified` can flip to `true`.
 *
 * The runner reads `verified` to decide whether to execute the fixture or
 * skip it in CI. Unverified fixtures still participate in shape validation
 * (subcategory_id must exist in the live taxonomy, trade must match), they
 * just don't run the full diagnostic pipeline yet.
 */

import type { FailureCostBand, FailureUrgency } from '@/lib/diagnosis/diagnosis-trade-taxonomy';

export interface AccuracyFixtureGroundTruth {
    /** Canonical trade label — must match the taxonomy row for this subcategory. */
    readonly trade: string;
    /** Must reference an `id` from `TAXONOMY_SUBCATEGORIES`. */
    readonly subcategory_id: string;
    /**
     * Failure mode id from the subcategory's `failureModes` catalog.
     * Optional — leave empty until Phase 2 failure-mode catalogs are verified
     * for this subcategory.
     */
    readonly failure_mode_id?: string;
    /**
     * Minimum confidence (0-100) the diagnostic pipeline should reach for
     * this case. Use ~60 for ambiguous cases and ~85 for textbook clear
     * cases.
     */
    readonly confidence_floor: number;
    /** Why this case is interesting — what behaviour it tests for. */
    readonly notes: string;
}

export interface AccuracyFixtureInputs {
    /** Optional image URLs — empty for text-only fixtures. */
    readonly image_urls?: readonly string[];
    /**
     * Initial homeowner-supplied text describing the fault. Equivalent to
     * `initial_image_description` in the production pipeline.
     */
    readonly user_text?: string;
    /** Optional conversation transcript leading up to the diagnosis. */
    readonly user_history?: ReadonlyArray<{
        readonly role: 'user' | 'assistant';
        readonly content: string;
    }>;
}

export interface AccuracyFixtureOptionalAssertions {
    /** Substrings expected to appear in the cascading_damage narrative. */
    readonly cascading_damage_includes?: readonly string[];
    readonly cost_band?: FailureCostBand;
    readonly urgency?: FailureUrgency;
    /** If true, the pipeline should request clarification rather than diagnose. */
    readonly requires_clarification_expected?: boolean;
}

export interface AccuracyFixture {
    /** Matches the fixture's filename (without extension). */
    readonly id: string;
    /** One-line plain-English description of the case. */
    readonly case_summary: string;
    /**
     * Verification gate. Stays `false` until a contractor has signed off on
     * the ground truth. CI only runs fixtures where this is `true`.
     */
    readonly verified: boolean;
    readonly ground_truth: AccuracyFixtureGroundTruth;
    readonly inputs: AccuracyFixtureInputs;
    readonly optional_assertions?: AccuracyFixtureOptionalAssertions;
}

export interface AccuracyBaseline {
    /** Fixture ids that are expected to pass the diagnostic pipeline. */
    readonly passing: readonly string[];
    /**
     * Fixture ids that are not yet expected to pass — newly-landed cases
     * sit here until the system actually handles them, at which point they
     * are promoted to `passing` and locked in by CI.
     */
    readonly expected_failures: readonly string[];
}
