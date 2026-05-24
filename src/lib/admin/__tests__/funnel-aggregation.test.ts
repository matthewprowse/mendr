import { describe, it, expect } from 'vitest';
import {
    computeFunnelStages,
    FUNNEL_STAGE_DEFS,
    type FunnelStageRaw,
} from '../funnel-aggregation';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function row(event_type: string, session_id: string): FunnelStageRaw {
    return { event_type, session_id };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeFunnelStages — stage shape and ordering', () => {
    it('returns exactly four stages in the documented order', () => {
        const { stages } = computeFunnelStages([]);
        expect(stages).toHaveLength(4);
        expect(stages.map((s) => s.key)).toEqual([
            'welcome_start',
            'diagnosis_complete',
            'match_view',
            'provider_contact',
        ]);
    });

    it('uses the canonical British-English labels from FUNNEL_STAGE_DEFS', () => {
        const { stages } = computeFunnelStages([]);
        expect(stages.map((s) => s.label)).toEqual(
            FUNNEL_STAGE_DEFS.map((d) => d.label),
        );
        // Spot-check the labels for accuracy.
        expect(stages[0].label).toBe('Welcome start');
        expect(stages[3].label).toBe('Provider contact');
    });
});

describe('computeFunnelStages — distinct session counts', () => {
    it('counts distinct session_ids per stage (duplicates within a session do not inflate the count)', () => {
        const rows = [
            // session A: welcome_start x3, diagnosis_complete x2
            row('welcome_start',      'A'),
            row('welcome_start',      'A'),
            row('welcome_start',      'A'),
            row('diagnosis_complete', 'A'),
            row('diagnosis_complete', 'A'),
            // session B: welcome_start once
            row('welcome_start',      'B'),
        ];
        const { stages, totalSessions } = computeFunnelStages(rows);
        expect(stages[0].count).toBe(2); // two distinct sessions
        expect(stages[1].count).toBe(1); // only session A reached diagnosis_complete
        expect(totalSessions).toBe(2);
    });
});

describe('computeFunnelStages — conversionFromPrior', () => {
    it('returns null for the first stage (no prior)', () => {
        const { stages } = computeFunnelStages([
            row('welcome_start', 'A'),
            row('welcome_start', 'B'),
        ]);
        expect(stages[0].conversionFromPrior).toBeNull();
    });

    it('computes the percentage of sessions retained from the prior stage', () => {
        // 100 sessions start, 50 complete diagnosis → 50% conversion at stage 2.
        const rows: FunnelStageRaw[] = [];
        for (let i = 0; i < 100; i++) rows.push(row('welcome_start', `s${i}`));
        for (let i = 0; i < 50; i++)  rows.push(row('diagnosis_complete', `s${i}`));

        const { stages } = computeFunnelStages(rows);
        expect(stages[0].count).toBe(100);
        expect(stages[1].count).toBe(50);
        expect(stages[1].conversionFromPrior).toBe(50);
    });

    it('computes conversion through every downstream stage', () => {
        const rows: FunnelStageRaw[] = [];
        for (let i = 0; i < 100; i++) rows.push(row('welcome_start',      `s${i}`));
        for (let i = 0; i < 80;  i++) rows.push(row('diagnosis_complete', `s${i}`));
        for (let i = 0; i < 40;  i++) rows.push(row('match_view',         `s${i}`));
        for (let i = 0; i < 10;  i++) rows.push(row('provider_contact',   `s${i}`));

        const { stages } = computeFunnelStages(rows);
        expect(stages[1].conversionFromPrior).toBe(80);  // 80 / 100
        expect(stages[2].conversionFromPrior).toBe(50);  // 40 / 80
        expect(stages[3].conversionFromPrior).toBe(25);  // 10 / 40
    });
});

describe('computeFunnelStages — edge cases', () => {
    it('returns 0/0/0/0 and null conversions for empty input', () => {
        const { stages, totalSessions } = computeFunnelStages([]);
        expect(stages.map((s) => s.count)).toEqual([0, 0, 0, 0]);
        // First stage is null by definition; the remaining stages have a
        // zero prior count so conversionFromPrior is also null (cannot divide).
        expect(stages.map((s) => s.conversionFromPrior)).toEqual([null, null, null, null]);
        expect(totalSessions).toBe(0);
    });

    it('does not crash when an intermediate stage is missing', () => {
        // welcome_start and match_view but no diagnosis_complete in between.
        const rows = [
            row('welcome_start', 'A'),
            row('welcome_start', 'B'),
            row('match_view',    'A'),
        ];
        const { stages } = computeFunnelStages(rows);
        expect(stages[0].count).toBe(2);
        expect(stages[1].count).toBe(0);
        expect(stages[2].count).toBe(1);
        // Stage 3 had prior count 0 (diagnosis_complete), so conversion is null
        // (cannot divide by zero — null is the documented sentinel).
        expect(stages[2].conversionFromPrior).toBeNull();
        // Stage 4 has prior count 1 (match_view) and own count 0 → 0%.
        expect(stages[3].count).toBe(0);
        expect(stages[3].conversionFromPrior).toBe(0);
    });

    it('silently ignores unknown event_types', () => {
        const rows = [
            row('welcome_start',     'A'),
            row('not_a_real_event',  'A'),
            row('rogue_event',       'B'),
            row('diagnosis_complete','A'),
        ];
        const { stages, totalSessions } = computeFunnelStages(rows);
        expect(stages[0].count).toBe(1);
        expect(stages[1].count).toBe(1);
        // Sessions A and B both contributed at least one row (B's rows were
        // unknown event types) — totalSessions counts only sessions seen on a
        // known stage.
        expect(totalSessions).toBe(1);
    });

    it('ignores rows with missing or non-string session_ids', () => {
        const rows: FunnelStageRaw[] = [
            row('welcome_start', 'A'),
            // @ts-expect-error — deliberately bad input
            { event_type: 'welcome_start', session_id: null },
            // @ts-expect-error — deliberately bad input
            { event_type: 'welcome_start' },
            row('welcome_start', ''),
        ];
        const { stages } = computeFunnelStages(rows);
        expect(stages[0].count).toBe(1);
    });
});
