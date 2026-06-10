/**
 * Unit tests for the accuracy scoring core + orchestrator. These run in the
 * normal (blocking) suite because they're pure and fast — they verify the
 * scoring math, not the model. The live model eval is the separate weekly job.
 */
import { describe, it, expect } from 'vitest';
import {
    normalizeTrade,
    scoreOutcome,
    buildAccuracyReport,
    type DiagnosisEvalFixture,
    type FixtureOutcome,
} from '../accuracy';
import { runAccuracyEval } from '../run-eval';

const fx = (over: Partial<DiagnosisEvalFixture> = {}): DiagnosisEvalFixture => ({
    id: 'f1',
    description: 'something is broken',
    expectedTrade: 'Plumbing',
    ...over,
});

describe('normalizeTrade', () => {
    it('is case- and whitespace-insensitive', () => {
        expect(normalizeTrade('  Air   Conditioning ')).toBe('air conditioning');
        expect(normalizeTrade('Plumbing')).toBe(normalizeTrade('plumbing'));
    });
});

describe('scoreOutcome', () => {
    it('marks a trade match regardless of case/spacing', () => {
        const out = scoreOutcome(fx({ expectedTrade: 'Air Conditioning' }), {
            trade: 'air conditioning',
            confidence: 88,
        });
        expect(out.tradeMatch).toBe(true);
        expect(out.confidence).toBe(88);
    });

    it('marks a trade miss and records the predicted trade', () => {
        const out = scoreOutcome(fx({ expectedTrade: 'Roofing' }), { trade: 'Waterproofing' });
        expect(out.tradeMatch).toBe(false);
        expect(out.predictedTrade).toBe('Waterproofing');
    });

    it('leaves subcategoryMatch null when the fixture pins no subcategory', () => {
        const out = scoreOutcome(fx(), { trade: 'Plumbing', subcategory_id: 'whatever' });
        expect(out.subcategoryMatch).toBeNull();
    });

    it('evaluates subcategory when the fixture pins one', () => {
        const hit = scoreOutcome(fx({ expectedSubcategoryId: 'geyser_fault' }), {
            trade: 'Plumbing',
            subcategory_id: 'geyser_fault',
        });
        expect(hit.subcategoryMatch).toBe(true);

        const miss = scoreOutcome(fx({ expectedSubcategoryId: 'geyser_fault' }), {
            trade: 'Plumbing',
            subcategory_id: 'blocked_drain',
        });
        expect(miss.subcategoryMatch).toBe(false);
    });

    it('defaults confidence to 0 and rejected to false when absent', () => {
        const out = scoreOutcome(fx(), { trade: 'Plumbing' });
        expect(out.confidence).toBe(0);
        expect(out.rejected).toBe(false);
    });
});

describe('buildAccuracyReport', () => {
    const outcomes: FixtureOutcome[] = [
        scoreOutcome(fx({ id: 'a', expectedTrade: 'Plumbing' }), { trade: 'Plumbing' }),
        scoreOutcome(fx({ id: 'b', expectedTrade: 'Plumbing' }), { trade: 'Electrical' }),
        scoreOutcome(fx({ id: 'c', expectedTrade: 'Roofing' }), { trade: 'Roofing' }),
        scoreOutcome(fx({ id: 'd', expectedTrade: 'Roofing', expectedSubcategoryId: 'leak' }), {
            trade: 'Roofing',
            subcategory_id: 'leak',
        }),
    ];

    it('computes overall trade accuracy as matches / total', () => {
        const r = buildAccuracyReport(outcomes);
        expect(r.total).toBe(4);
        expect(r.tradeMatches).toBe(3);
        expect(r.tradeAccuracy).toBeCloseTo(0.75);
    });

    it('breaks accuracy down per expected trade', () => {
        const r = buildAccuracyReport(outcomes);
        expect(r.perTrade.Plumbing).toEqual({ total: 2, correct: 1, accuracy: 0.5 });
        expect(r.perTrade.Roofing).toEqual({ total: 2, correct: 2, accuracy: 1 });
    });

    it('only counts subcategory accuracy over fixtures that pinned one', () => {
        const r = buildAccuracyReport(outcomes);
        expect(r.subcategoryEvaluated).toBe(1);
        expect(r.subcategoryMatches).toBe(1);
        expect(r.subcategoryAccuracy).toBe(1);
    });

    it('returns null subcategory accuracy when nothing pinned a subcategory', () => {
        const r = buildAccuracyReport([
            scoreOutcome(fx(), { trade: 'Plumbing' }),
        ]);
        expect(r.subcategoryAccuracy).toBeNull();
    });

    it('lists trade mismatches for the confusion view', () => {
        const r = buildAccuracyReport(outcomes);
        expect(r.mismatches.map((m) => m.id)).toEqual(['b']);
    });

    it('handles an empty batch without dividing by zero', () => {
        const r = buildAccuracyReport([]);
        expect(r.tradeAccuracy).toBe(0);
        expect(r.subcategoryAccuracy).toBeNull();
    });
});

describe('runAccuracyEval', () => {
    it('runs each fixture through the classify fn and aggregates', async () => {
        const fixtures = [
            fx({ id: 'a', expectedTrade: 'Plumbing' }),
            fx({ id: 'b', expectedTrade: 'Electrical' }),
        ];
        // Stub classifier: echoes the expected trade for 'a', wrong for 'b'.
        const classify = async (f: DiagnosisEvalFixture) => ({
            trade: f.id === 'a' ? 'Plumbing' : 'Plumbing',
            confidence: 90,
        });
        const { report, outcomes } = await runAccuracyEval(fixtures, classify);
        expect(outcomes).toHaveLength(2);
        expect(report.tradeAccuracy).toBeCloseTo(0.5);
    });
});
