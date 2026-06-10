/**
 * Drift guard for the eval fixture set.
 *
 * The deleted accuracy harness once caught a real fixture/taxonomy drift —
 * this is the cheap, always-on replacement for that specific failure mode. It
 * does NOT call the model; it only asserts the fixtures stay internally
 * consistent and aligned with SERVICE_LABELS, so a trade rename can't silently
 * make every fixture unwinnable.
 */
import { describe, it, expect } from 'vitest';
import { SERVICE_LABELS } from '@/lib/services';
import { DIAGNOSIS_EVAL_FIXTURES } from '../diagnosis-fixtures';

describe('diagnosis eval fixtures', () => {
    it('has a non-trivial number of fixtures', () => {
        expect(DIAGNOSIS_EVAL_FIXTURES.length).toBeGreaterThanOrEqual(10);
    });

    it('uses unique fixture ids', () => {
        const ids = DIAGNOSIS_EVAL_FIXTURES.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every expectedTrade is a canonical SERVICE_LABELS member (taxonomy drift guard)', () => {
        const canonical = new Set<string>(SERVICE_LABELS);
        const bad = DIAGNOSIS_EVAL_FIXTURES.filter((f) => !canonical.has(f.expectedTrade));
        expect(
            bad.map((f) => `${f.id} → "${f.expectedTrade}"`),
            'Fixture expectedTrade no longer in SERVICE_LABELS — update the fixture or the taxonomy.',
        ).toEqual([]);
    });

    it('every fixture has a substantive, homeowner-voice description', () => {
        for (const f of DIAGNOSIS_EVAL_FIXTURES) {
            expect(f.description.trim().length, `${f.id} description too short`).toBeGreaterThan(30);
        }
    });

    it('covers a spread of trades, not just one', () => {
        const trades = new Set(DIAGNOSIS_EVAL_FIXTURES.map((f) => f.expectedTrade));
        expect(trades.size).toBeGreaterThanOrEqual(8);
    });
});
