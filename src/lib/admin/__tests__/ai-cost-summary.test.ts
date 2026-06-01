import { describe, it, expect } from 'vitest';
import { summarizeAiCosts, type AiCostEvent } from '../ai-cost-summary';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function ev(partial: Partial<AiCostEvent>): AiCostEvent {
    return {
        created_at: '2026-06-05T10:00:00.000Z',
        estimated_usd: 0,
        total_tokens: 0,
        model_name: 'gemini-2.5-flash',
        endpoint: 'diagnose/classify',
        conversation_id: null,
        ...partial,
    };
}

describe('summarizeAiCosts — empty', () => {
    it('returns zeroed totals and null per-diagnosis metrics', () => {
        const s = summarizeAiCosts([], NOW);
        expect(s.monthToDate).toEqual({ usd: 0, calls: 0, tokens: 0 });
        expect(s.lastMonth).toEqual({ usd: 0, calls: 0, tokens: 0 });
        expect(s.costPerDiagnosis).toBeNull();
        expect(s.callsPerDiagnosis).toBeNull();
        expect(s.projection.elapsedDays).toBe(15);
        expect(s.projection.daysInMonth).toBe(30);
        expect(s.projection.runRateUsd).toBe(0);
    });
});

describe('summarizeAiCosts — populated', () => {
    const events: AiCostEvent[] = [
        ev({ created_at: '2026-06-05T10:00:00Z', model_name: 'A', endpoint: 'X', conversation_id: 'c1', estimated_usd: 0.1, total_tokens: 1000 }),
        ev({ created_at: '2026-06-06T10:00:00Z', model_name: 'A', endpoint: 'Y', conversation_id: 'c1', estimated_usd: 0.2, total_tokens: 2000 }),
        ev({ created_at: '2026-06-07T10:00:00Z', model_name: 'B', endpoint: 'X', conversation_id: 'c2', estimated_usd: 0.3, total_tokens: 3000 }),
        ev({ created_at: '2026-06-08T10:00:00Z', model_name: 'A', endpoint: 'X', conversation_id: null, estimated_usd: 0.05, total_tokens: 500 }),
        ev({ created_at: '2026-05-20T10:00:00Z', model_name: 'A', endpoint: 'X', conversation_id: 'c9', estimated_usd: 1.0, total_tokens: 9000 }),
    ];

    it('splits month-to-date vs last month', () => {
        const s = summarizeAiCosts(events, NOW);
        expect(s.monthToDate.usd).toBeCloseTo(0.65, 6);
        expect(s.monthToDate.calls).toBe(4);
        expect(s.monthToDate.tokens).toBe(6500);
        expect(s.lastMonth.usd).toBeCloseTo(1.0, 6);
        expect(s.lastMonth.calls).toBe(1);
    });

    it('breaks down by model and endpoint, sorted by spend', () => {
        const s = summarizeAiCosts(events, NOW);
        expect(s.byModel[0]).toMatchObject({ model: 'A', calls: 3 });
        expect(s.byModel[0].usd).toBeCloseTo(0.35, 6);
        expect(s.byModel[1].model).toBe('B');
        expect(s.byEndpoint[0].endpoint).toBe('X');
        expect(s.byEndpoint[0].usd).toBeCloseTo(0.45, 6);
    });

    it('computes cost and calls per diagnosis over conversation events', () => {
        const s = summarizeAiCosts(events, NOW);
        // c1 = 0.30, c2 = 0.30 → 0.60 / 2 distinct = 0.30; 3 conv calls / 2 = 1.5
        expect(s.costPerDiagnosis).toBeCloseTo(0.3, 6);
        expect(s.callsPerDiagnosis).toBeCloseTo(1.5, 6);
    });

    it('projects month-end spend by run-rate', () => {
        const s = summarizeAiCosts(events, NOW);
        // 0.65 / 15 elapsed * 30 days = 1.30
        expect(s.projection.runRateUsd).toBeCloseTo(1.3, 6);
    });
});
