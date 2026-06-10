/**
 * Diagnostic-accuracy eval — pure scoring core.
 *
 * Rebuilds the (deleted) accuracy harness as a SEPARATE, non-blocking tier.
 * This module holds only deterministic, dependency-light scoring so it can be
 * unit-tested without touching Gemini. The orchestration that actually calls
 * the classifier lives in `run-eval.ts`; the fixture set lives in
 * `diagnosis-fixtures.ts`.
 *
 * Accuracy is tracked as a TREND, never a pass/fail gate (per the audit's
 * Phase E): the weekly job records tradeAccuracy over time so taxonomy or
 * prompt drift shows up as a slope, not a red build.
 */

/** A single labelled fault → expected trade (and optionally subcategory). */
export interface DiagnosisEvalFixture {
    /** Stable id for trend correlation across runs. */
    id: string;
    /** The homeowner's fault description — the model's only input. */
    description: string;
    /** Canonical trade label from SERVICE_LABELS the classifier should pick. */
    expectedTrade: string;
    /** Optional taxonomy subcategory slug, when we want to pin it tighter. */
    expectedSubcategoryId?: string;
    /** Free-text note on why this fixture exists (edge case it guards). */
    note?: string;
}

/** What the classifier returned for one fixture, scored against expectation. */
export interface FixtureOutcome {
    id: string;
    expectedTrade: string;
    predictedTrade: string;
    tradeMatch: boolean;
    expectedSubcategoryId: string | null;
    predictedSubcategoryId: string | null;
    /** null when the fixture pins no subcategory (not evaluated). */
    subcategoryMatch: boolean | null;
    confidence: number;
    rejected: boolean;
}

/** The minimal slice of a ClassificationResult the scorer needs. */
export interface ScorableClassification {
    trade: string;
    subcategory_id?: string;
    confidence?: number;
    rejected?: boolean;
}

export interface AccuracyReport {
    total: number;
    tradeMatches: number;
    /** 0..1 — the headline trend metric. */
    tradeAccuracy: number;
    subcategoryEvaluated: number;
    subcategoryMatches: number;
    /** 0..1, or null when no fixture pinned a subcategory. */
    subcategoryAccuracy: number | null;
    /** Per-expected-trade breakdown, surfacing which trades regress. */
    perTrade: Record<string, { total: number; correct: number; accuracy: number }>;
    /** Every trade miss, for eyeballing the confusion in the report. */
    mismatches: FixtureOutcome[];
}

/** Case/space-insensitive trade comparison so "Air Conditioning " == "air conditioning". */
export function normalizeTrade(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function scoreOutcome(
    fixture: DiagnosisEvalFixture,
    result: ScorableClassification,
): FixtureOutcome {
    const predictedTrade = result.trade ?? '';
    const tradeMatch = normalizeTrade(fixture.expectedTrade) === normalizeTrade(predictedTrade);

    const expectedSub = fixture.expectedSubcategoryId ?? null;
    const predictedSub = result.subcategory_id ?? null;
    const subcategoryMatch = expectedSub === null ? null : expectedSub === predictedSub;

    return {
        id: fixture.id,
        expectedTrade: fixture.expectedTrade,
        predictedTrade,
        tradeMatch,
        expectedSubcategoryId: expectedSub,
        predictedSubcategoryId: predictedSub,
        subcategoryMatch,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        rejected: Boolean(result.rejected),
    };
}

export function buildAccuracyReport(outcomes: FixtureOutcome[]): AccuracyReport {
    const total = outcomes.length;
    const tradeMatches = outcomes.filter((o) => o.tradeMatch).length;

    const subEvaluated = outcomes.filter((o) => o.subcategoryMatch !== null);
    const subMatches = subEvaluated.filter((o) => o.subcategoryMatch === true).length;

    const perTrade: AccuracyReport['perTrade'] = {};
    for (const o of outcomes) {
        const bucket = (perTrade[o.expectedTrade] ??= { total: 0, correct: 0, accuracy: 0 });
        bucket.total += 1;
        if (o.tradeMatch) bucket.correct += 1;
    }
    for (const bucket of Object.values(perTrade)) {
        bucket.accuracy = bucket.total === 0 ? 0 : bucket.correct / bucket.total;
    }

    return {
        total,
        tradeMatches,
        tradeAccuracy: total === 0 ? 0 : tradeMatches / total,
        subcategoryEvaluated: subEvaluated.length,
        subcategoryMatches: subMatches,
        subcategoryAccuracy: subEvaluated.length === 0 ? null : subMatches / subEvaluated.length,
        perTrade,
        mismatches: outcomes.filter((o) => !o.tradeMatch),
    };
}
