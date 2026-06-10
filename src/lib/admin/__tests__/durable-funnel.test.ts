import { describe, it, expect } from 'vitest';
import { computeDurableFunnel, type DurableFunnelRow } from '../durable-funnel';

function row(partial: Partial<DurableFunnelRow>): DurableFunnelRow {
    return {
        created_at: '2026-05-10T10:00:00.000Z',
        trade: null,
        delivered_at: null,
        matches_shown_at: null,
        first_contact_at: null,
        ...partial,
    };
}

describe('computeDurableFunnel — empty input', () => {
    it('returns four zeroed stages with null conversions and metrics', () => {
        const result = computeDurableFunnel([]);
        expect(result.totalDiagnoses).toBe(0);
        expect(result.overallConversion).toBeNull();
        expect(result.medianMinutesToContact).toBeNull();
        expect(result.tradeBreakdown).toEqual([]);
        expect(result.stages.map((s) => s.key)).toEqual([
            'started',
            'delivered',
            'matches_shown',
            'contacted',
        ]);
        expect(result.stages.every((s) => s.count === 0)).toBe(true);
        expect(result.stages[0].conversionFromPrior).toBeNull();
    });
});

describe('computeDurableFunnel — stage counts and conversions', () => {
    const rows: DurableFunnelRow[] = [
        // Full journey: started → delivered → matches → contacted (20 min)
        row({
            created_at: '2026-05-10T10:00:00.000Z',
            trade: 'Plumbing',
            delivered_at: '2026-05-10T10:01:00.000Z',
            matches_shown_at: '2026-05-10T10:05:00.000Z',
            first_contact_at: '2026-05-10T10:20:00.000Z',
        }),
        // Delivered only
        row({ trade: 'Plumbing', delivered_at: '2026-05-11T10:01:00.000Z' }),
        // Delivered + matches, no contact
        row({
            trade: 'Electrical',
            delivered_at: '2026-05-12T10:01:00.000Z',
            matches_shown_at: '2026-05-12T10:03:00.000Z',
        }),
        // Started only (e.g. AI never returned)
        row({ trade: null }),
    ];

    it('counts each stage correctly', () => {
        const { stages } = computeDurableFunnel(rows);
        const byKey = Object.fromEntries(stages.map((s) => [s.key, s.count]));
        expect(byKey).toEqual({ started: 4, delivered: 3, matches_shown: 2, contacted: 1 });
    });

    it('computes conversion from the prior stage', () => {
        const { stages } = computeDurableFunnel(rows);
        const byKey = Object.fromEntries(stages.map((s) => [s.key, s.conversionFromPrior]));
        expect(byKey.started).toBeNull();
        expect(byKey.delivered).toBeCloseTo(75); // 3/4
        expect(byKey.matches_shown).toBeCloseTo((2 / 3) * 100);
        expect(byKey.contacted).toBeCloseTo(50); // 1/2
    });

    it('computes overall conversion and median time to contact', () => {
        const { overallConversion, medianMinutesToContact } = computeDurableFunnel(rows);
        expect(overallConversion).toBeCloseTo(25); // 1/4
        expect(medianMinutesToContact).toBe(20);
    });

    it('breaks down by trade, sorted by started desc, with Unknown bucket', () => {
        const { tradeBreakdown } = computeDurableFunnel(rows);
        expect(tradeBreakdown[0]).toMatchObject({ trade: 'Plumbing', started: 2, contacted: 1 });
        const trades = tradeBreakdown.map((t) => t.trade);
        expect(trades).toContain('Electrical');
        expect(trades).toContain('Unknown');
    });
});
