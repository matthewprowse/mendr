/**
 * Tests for cost-estimates.ts — getCostEstimate, formatCostEstimate
 */

import { describe, it, expect } from 'vitest';
import { getCostEstimate, formatCostEstimate } from '../cost-estimates';

// ── getCostEstimate ───────────────────────────────────────────────────────────

describe('getCostEstimate', () => {
    it('returns null for null subcategoryId', () => {
        expect(getCostEstimate(null)).toBeNull();
    });

    it('returns null for undefined subcategoryId', () => {
        expect(getCostEstimate(undefined)).toBeNull();
    });

    it('returns null for an unknown subcategoryId', () => {
        expect(getCostEstimate('none_unmapped')).toBeNull();
        expect(getCostEstimate('not_a_real_id')).toBeNull();
    });

    it('returns a FormattedCostEstimate for a known subcategoryId', () => {
        const result = getCostEstimate('gate_motor_fault');
        expect(result).not.toBeNull();
        expect(result?.label).toBeTruthy();
        expect(typeof result?.label).toBe('string');
    });

    it('returns a note when the estimate has one', () => {
        // gate_motor_fault has a note in the static table
        const result = getCostEstimate('gate_motor_fault');
        expect(result?.note).toBeTruthy();
    });

    it('returns null note when estimate has no note', () => {
        // tap_toilet_repair has no note field in the static table
        const result = getCostEstimate('tap_toilet_repair');
        expect(result?.note).toBeNull();
    });

    it('covers multiple known subcategories', () => {
        const knownIds = [
            'db_board_tripping', 'geyser_fault_plumbing', 'burst_pipe_leak',
            'blocked_drain', 'roof_leak_repair', 'tile_repair', 'lockout_emergency',
        ];
        for (const id of knownIds) {
            const result = getCostEstimate(id);
            expect(result, `Expected estimate for ${id}`).not.toBeNull();
        }
    });
});

// ── formatCostEstimate ────────────────────────────────────────────────────────

describe('formatCostEstimate', () => {
    it('formats a bounded range (min–max · unit)', () => {
        const result = formatCostEstimate({ min: 800, max: 3500, unit: 'repair' });
        expect(result.label).toContain('800');
        expect(result.label).toContain('3');
        expect(result.label).toContain('repair');
    });

    it('formats an open-ended range (From RX · unit) when max is null', () => {
        const result = formatCostEstimate({ min: 5000, max: null, unit: 'from' });
        expect(result.label).toMatch(/[Ff]rom/);
        expect(result.label).toContain('5');
    });

    it('returns the note verbatim when present', () => {
        const result = formatCostEstimate({ min: 800, max: 2500, unit: 'repair', note: 'Spring R800–R2,000' });
        expect(result.note).toBe('Spring R800–R2,000');
    });

    it('returns null note when not provided', () => {
        const result = formatCostEstimate({ min: 300, max: 1200, unit: 'per job' });
        expect(result.note).toBeNull();
    });

    it('uses ZAR currency formatting (contains R symbol)', () => {
        const result = formatCostEstimate({ min: 1000, max: 5000, unit: 'repair' });
        // Intl.NumberFormat with currency:ZAR typically produces "R1 000" or "R1,000"
        expect(result.label).toMatch(/R\s?[\d,\s]/);
    });
});
