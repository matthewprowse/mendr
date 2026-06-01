/**
 * Phase 6 of the Diagnosis Architecture Hardening Plan.
 *
 * Pure-function computation of the commit-vs-clarify decision from the
 * Agent 2c hypothesis tree and Agent 2a facet scores. Replaces the V1
 * "confidence < 85 → clarify" arbitrator with a structured rubric.
 *
 * Completion criteria — ALL must hold for `commit`:
 *   1. Top hypothesis `confidence_alone >= 0.75`
 *   2. Gap to second hypothesis `>= 0.25` (no close runner-up)
 *   3. Top hypothesis has ≥1 `evidence_for` and ≤1 non-trivial `evidence_against`
 *   4. Either `image_sufficiency != 'absent'` OR both `component_confidence >= 85`
 *      AND `cause_confidence >= 85`.
 *
 * If all hold → `commit`.
 * Else if ≥1 chip discriminates → `ask`.
 * Else → `commit_low_confidence`.
 *
 * See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 6
 */

import type {
    DiagnosticReasoning,
    DiagnosisFacets,
    RecommendedAction,
} from '@/features/diagnosis/types';

const TOP_CONFIDENCE_MIN = 0.75;
const RUNNER_UP_GAP_MIN = 0.25;
const COMPONENT_MIN_WHEN_NO_IMAGE = 85;
const CAUSE_MIN_WHEN_NO_IMAGE = 85;
const NON_TRIVIAL_EVIDENCE_MAX = 1;

export interface CompletionDecision {
    action: RecommendedAction;
    /**
     * Diagnostic breakdown of which criterion fired. Logged for Phase 9
     * dashboard + Phase 2 critique cross-reference. Even when action is
     * 'commit', the reasons list explains why.
     */
    reasons: string[];
}

/**
 * Server-authoritative commit-vs-clarify decision.
 *
 * Returns null when inputs are insufficient (no reasoning OR no facets) —
 * callers fall back to V1 gating in that case. Phase 6 is a strict addition;
 * removing it leaves the V1 behaviour unchanged.
 */
export function computeRecommendedAction(
    reasoning: DiagnosticReasoning | null | undefined,
    facets: DiagnosisFacets | null | undefined,
): CompletionDecision | null {
    if (!reasoning || !facets) return null;

    const hypotheses = reasoning.hypotheses ?? [];
    if (hypotheses.length === 0) return null;

    // Sort hypotheses by confidence_alone DESC to identify top + runner-up.
    const sorted = [...hypotheses].sort(
        (a, b) => (b.confidence_alone ?? 0) - (a.confidence_alone ?? 0),
    );
    const top = sorted[0];
    const runnerUp = sorted[1];
    const reasons: string[] = [];

    // Criterion 1: top hypothesis confidence.
    const topPass = (top.confidence_alone ?? 0) >= TOP_CONFIDENCE_MIN;
    reasons.push(
        topPass
            ? `c1 PASS: top confidence ${(top.confidence_alone ?? 0).toFixed(2)} >= ${TOP_CONFIDENCE_MIN}`
            : `c1 FAIL: top confidence ${(top.confidence_alone ?? 0).toFixed(2)} < ${TOP_CONFIDENCE_MIN}`,
    );

    // Criterion 2: gap to runner-up. If no runner-up, the gap is trivially "infinite".
    const gap = runnerUp ? (top.confidence_alone ?? 0) - (runnerUp.confidence_alone ?? 0) : 1;
    const gapPass = gap >= RUNNER_UP_GAP_MIN;
    reasons.push(
        gapPass
            ? `c2 PASS: runner-up gap ${gap.toFixed(2)} >= ${RUNNER_UP_GAP_MIN}`
            : `c2 FAIL: runner-up gap ${gap.toFixed(2)} < ${RUNNER_UP_GAP_MIN}`,
    );

    // Criterion 3: evidence ratio. Empty evidence_for → fail.
    // The "non-trivial evidence_against" simplification: count every non-empty
    // entry. The plan envisaged finer-grained "non-trivial" classification but
    // Phase 6 deliberately keeps the rule mechanical — Agent 2c's prompt is
    // responsible for not emitting trivial against-entries in the first place.
    const evidenceFor = (top.evidence_for ?? []).filter((s) => s && s.trim().length > 0);
    const evidenceAgainst = (top.evidence_against ?? []).filter(
        (s) => s && s.trim().length > 0,
    );
    const evidencePass =
        evidenceFor.length >= 1 && evidenceAgainst.length <= NON_TRIVIAL_EVIDENCE_MAX;
    reasons.push(
        evidencePass
            ? `c3 PASS: evidence_for=${evidenceFor.length}, evidence_against=${evidenceAgainst.length}`
            : `c3 FAIL: evidence_for=${evidenceFor.length}, evidence_against=${evidenceAgainst.length}`,
    );

    // Criterion 4: image sufficiency OR strong text-only facets.
    const imageOk = facets.image_sufficiency !== 'absent';
    const textOnlyStrong =
        facets.component_confidence >= COMPONENT_MIN_WHEN_NO_IMAGE &&
        facets.cause_confidence >= CAUSE_MIN_WHEN_NO_IMAGE;
    const facetsPass = imageOk || textOnlyStrong;
    reasons.push(
        facetsPass
            ? `c4 PASS: image_sufficiency=${facets.image_sufficiency} OR (component=${facets.component_confidence} >=${COMPONENT_MIN_WHEN_NO_IMAGE} AND cause=${facets.cause_confidence} >=${CAUSE_MIN_WHEN_NO_IMAGE})`
            : `c4 FAIL: image_sufficiency=absent AND (component=${facets.component_confidence} OR cause=${facets.cause_confidence}) below threshold`,
    );

    if (topPass && gapPass && evidencePass && facetsPass) {
        return { action: 'commit', reasons };
    }

    // At least one criterion failed — check if any chip discriminates.
    // A "discriminating chip" is one whose `supports` is non-null OR whose
    // `rules_out` list is non-empty. Escape chips (both null/empty) are
    // structurally required but do not count as discriminators here.
    const discriminatingChips = (reasoning.chips ?? []).filter(
        (c) => c.supports !== null || (c.rules_out && c.rules_out.length > 0),
    );

    if (discriminatingChips.length > 0) {
        reasons.push(
            `decision: ask (${discriminatingChips.length} discriminating chip${discriminatingChips.length === 1 ? '' : 's'} available)`,
        );
        return { action: 'ask', reasons };
    }

    reasons.push('decision: commit_low_confidence (no chip would reduce uncertainty)');
    return { action: 'commit_low_confidence', reasons };
}
