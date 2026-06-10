/**
 * Diagnostic-accuracy eval — orchestrator.
 *
 * Runs each fixture through a caller-supplied classify function and scores the
 * batch. The classify function is injected so the same harness drives both:
 *   • structure mode (MOCK_LLM) — wiring/schema only; accuracy is meaningless
 *     because the mock returns a constant, so callers don't assert on it.
 *   • live mode — the real Gemini classifier, where tradeAccuracy is the signal.
 *
 * Pure orchestration: no Gemini import here, so it stays unit-testable with a
 * stub classify fn. The CLI (`scripts/diagnosis-accuracy-eval.ts`) wires the
 * real classifier.
 */
import {
    scoreOutcome,
    buildAccuracyReport,
    type DiagnosisEvalFixture,
    type ScorableClassification,
    type AccuracyReport,
    type FixtureOutcome,
} from './accuracy';

export type ClassifyFixtureFn = (
    fixture: DiagnosisEvalFixture,
) => Promise<ScorableClassification>;

export interface EvalRunResult {
    report: AccuracyReport;
    outcomes: FixtureOutcome[];
}

export async function runAccuracyEval(
    fixtures: DiagnosisEvalFixture[],
    classify: ClassifyFixtureFn,
): Promise<EvalRunResult> {
    const outcomes: FixtureOutcome[] = [];
    for (const fixture of fixtures) {
        const result = await classify(fixture);
        outcomes.push(scoreOutcome(fixture, result));
    }
    return { report: buildAccuracyReport(outcomes), outcomes };
}
