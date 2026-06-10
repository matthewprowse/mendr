/**
 * Phase 6 — unit tests for `computeRecommendedAction`.
 *
 * Two layers of coverage:
 *   1. Each completion criterion in isolation: pass/fail combinations
 *      driving each of the three possible actions.
 *   2. Smoke check that the function returns a sensible action shape for
 *      the eight Phase 0 fixtures — we don't assert exact expected actions
 *      against the fixture's mockAgentOutput here because the fixture mocks
 *      are V1-shaped (no facets); the real fixture-driven check lives in
 *      `src/__tests__/diagnostic-reasoning/runner.test.ts` once that file
 *      swaps out the it.fails stub for the real function in P6.6.
 */

import { describe, expect, it } from 'vitest';
import { computeRecommendedAction } from '@/lib/diagnosis/recommended-action';
import type {
    DiagnosisFacets,
    DiagnosticReasoning,
} from '@/features/diagnosis/types';

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeFacets(overrides: Partial<DiagnosisFacets> = {}): DiagnosisFacets {
    return {
        trade_confidence: 95,
        component_confidence: 90,
        cause_confidence: 85,
        image_sufficiency: 'sufficient',
        committed_observations: [],
        explicit_unknowns: [],
        ...overrides,
    };
}

function makeReasoning(
    overrides: Partial<DiagnosticReasoning> = {},
): DiagnosticReasoning {
    return {
        hypotheses: [
            {
                id: 'h1',
                label: 'Top hypothesis',
                confidence_alone: 0.85,
                evidence_for: ['Strong supporting fact'],
                evidence_against: [],
            },
            {
                id: 'h2',
                label: 'Runner-up',
                confidence_alone: 0.5,
                evidence_for: ['Some weak evidence'],
                evidence_against: [],
            },
        ],
        what_we_dont_know: 'irrelevant',
        why_it_matters: 'irrelevant',
        chips: [
            {
                id: 'c1',
                text: 'Something else.',
                supports: null,
                rules_out: [],
            },
        ],
        round: 1,
        next_step_if_unresolved: 'ask_again',
        ...overrides,
    };
}

// ── Null-input fallback ───────────────────────────────────────────────────────

describe('computeRecommendedAction — null/missing inputs', () => {
    it('returns null when reasoning is missing', () => {
        expect(computeRecommendedAction(null, makeFacets())).toBeNull();
        expect(computeRecommendedAction(undefined, makeFacets())).toBeNull();
    });

    it('returns null when facets are missing', () => {
        expect(computeRecommendedAction(makeReasoning(), null)).toBeNull();
        expect(computeRecommendedAction(makeReasoning(), undefined)).toBeNull();
    });

    it('returns null when reasoning has no hypotheses', () => {
        expect(
            computeRecommendedAction(makeReasoning({ hypotheses: [] }), makeFacets()),
        ).toBeNull();
    });
});

// ── Commit (all four criteria pass) ───────────────────────────────────────────

describe('computeRecommendedAction — commit', () => {
    it('commits when all four criteria pass', () => {
        const decision = computeRecommendedAction(makeReasoning(), makeFacets());
        expect(decision?.action).toBe('commit');
    });

    it('commits with single hypothesis and no runner-up (gap is infinite)', () => {
        const decision = computeRecommendedAction(
            makeReasoning({
                hypotheses: [
                    {
                        id: 'h1',
                        label: 'Only one',
                        confidence_alone: 0.9,
                        evidence_for: ['Conclusive fact'],
                        evidence_against: [],
                    },
                ],
            }),
            makeFacets(),
        );
        expect(decision?.action).toBe('commit');
    });

    it("commits text-only when image_sufficiency='absent' but both component+cause are >= 85", () => {
        // The garage-door case shape.
        const decision = computeRecommendedAction(
            makeReasoning(),
            makeFacets({
                image_sufficiency: 'absent',
                component_confidence: 90,
                cause_confidence: 85,
            }),
        );
        expect(decision?.action).toBe('commit');
    });
});

// ── Criterion 1 fail (top hypothesis below 0.75) ──────────────────────────────

describe("computeRecommendedAction — criterion 1 fail (top confidence < 0.75)", () => {
    it('moves to ask when a discriminating chip exists', () => {
        const decision = computeRecommendedAction(
            makeReasoning({
                hypotheses: [
                    {
                        id: 'h1',
                        label: 'Top',
                        confidence_alone: 0.6,
                        evidence_for: ['Some fact'],
                        evidence_against: [],
                    },
                    {
                        id: 'h2',
                        label: 'Runner-up',
                        confidence_alone: 0.3,
                        evidence_for: ['Other'],
                        evidence_against: [],
                    },
                ],
                chips: [
                    {
                        id: 'c1',
                        text: 'Tap A',
                        supports: 'h1',
                        rules_out: ['h2'],
                    },
                    {
                        id: 'c2',
                        text: 'Something else.',
                        supports: null,
                        rules_out: [],
                    },
                ],
            }),
            makeFacets(),
        );
        expect(decision?.action).toBe('ask');
    });

    it('falls through to commit_low_confidence when no chip discriminates', () => {
        const decision = computeRecommendedAction(
            makeReasoning({
                hypotheses: [
                    {
                        id: 'h1',
                        label: 'Top',
                        confidence_alone: 0.6,
                        evidence_for: ['Some fact'],
                        evidence_against: [],
                    },
                ],
                chips: [
                    {
                        id: 'c1',
                        text: 'Something else.',
                        supports: null,
                        rules_out: [],
                    },
                ],
            }),
            makeFacets(),
        );
        expect(decision?.action).toBe('commit_low_confidence');
    });
});

// ── Criterion 2 fail (runner-up too close) ────────────────────────────────────

describe('computeRecommendedAction — criterion 2 fail (close runner-up)', () => {
    it('moves to ask when chips can discriminate', () => {
        const decision = computeRecommendedAction(
            makeReasoning({
                hypotheses: [
                    {
                        id: 'h1',
                        label: 'Top',
                        confidence_alone: 0.8,
                        evidence_for: ['Fact A'],
                        evidence_against: [],
                    },
                    {
                        id: 'h2',
                        label: 'Runner-up',
                        confidence_alone: 0.65, // gap = 0.15, < 0.25
                        evidence_for: ['Fact B'],
                        evidence_against: [],
                    },
                ],
                chips: [
                    { id: 'c1', text: 'Tap A', supports: 'h1', rules_out: ['h2'] },
                    { id: 'c2', text: 'Tap B', supports: 'h2', rules_out: ['h1'] },
                ],
            }),
            makeFacets(),
        );
        expect(decision?.action).toBe('ask');
    });
});

// ── Criterion 3 fail (evidence ratio) ─────────────────────────────────────────

describe('computeRecommendedAction — criterion 3 fail (evidence ratio)', () => {
    it('fails when top hypothesis has no evidence_for', () => {
        const decision = computeRecommendedAction(
            makeReasoning({
                hypotheses: [
                    {
                        id: 'h1',
                        label: 'Top',
                        confidence_alone: 0.9,
                        evidence_for: [],
                        evidence_against: [],
                    },
                ],
            }),
            makeFacets(),
        );
        expect(decision?.action).not.toBe('commit');
    });

    it('fails when top hypothesis has >1 non-trivial evidence_against', () => {
        const decision = computeRecommendedAction(
            makeReasoning({
                hypotheses: [
                    {
                        id: 'h1',
                        label: 'Top',
                        confidence_alone: 0.9,
                        evidence_for: ['Strong fact'],
                        evidence_against: ['Against A', 'Against B'],
                    },
                ],
            }),
            makeFacets(),
        );
        expect(decision?.action).not.toBe('commit');
    });
});

// ── Criterion 4 fail (image_sufficiency absent + weak text facets) ────────────

describe('computeRecommendedAction — criterion 4 fail (no image + weak facets)', () => {
    it('fails commit when image is absent and component_confidence is too low', () => {
        const decision = computeRecommendedAction(
            makeReasoning(),
            makeFacets({
                image_sufficiency: 'absent',
                component_confidence: 60,
                cause_confidence: 95,
            }),
        );
        expect(decision?.action).not.toBe('commit');
    });

    it('fails commit when image is absent and cause_confidence is too low', () => {
        const decision = computeRecommendedAction(
            makeReasoning(),
            makeFacets({
                image_sufficiency: 'absent',
                component_confidence: 95,
                cause_confidence: 60,
            }),
        );
        expect(decision?.action).not.toBe('commit');
    });

    it('passes when image is partial regardless of facet thresholds', () => {
        const decision = computeRecommendedAction(
            makeReasoning(),
            makeFacets({
                image_sufficiency: 'partial',
                component_confidence: 70,
                cause_confidence: 70,
            }),
        );
        // Image is non-absent so c4 passes; other criteria default to pass.
        expect(decision?.action).toBe('commit');
    });
});

// ── Reasons payload ───────────────────────────────────────────────────────────

describe('computeRecommendedAction — reasons payload', () => {
    it('always returns a non-empty reasons array', () => {
        const decision = computeRecommendedAction(makeReasoning(), makeFacets());
        expect(decision?.reasons).toBeDefined();
        expect(decision!.reasons.length).toBeGreaterThan(0);
    });

    it('reasons list documents each criterion', () => {
        const decision = computeRecommendedAction(makeReasoning(), makeFacets());
        const joined = decision!.reasons.join('\n');
        expect(joined).toContain('c1');
        expect(joined).toContain('c2');
        expect(joined).toContain('c3');
        expect(joined).toContain('c4');
    });
});
