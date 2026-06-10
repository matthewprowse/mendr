/**
 * Tests for equipment-mention extraction.
 *
 * Covers:
 *   - Direct equipment mentions resolve to correct subcategory.
 *   - SA brand-context patterns work (Kwikot, Centurion, etc.).
 *   - Mentions in conversation history are picked up.
 *   - De-duplication across siblings keeps the highest-confidence match.
 *   - Invariant: every pattern's subcategoryId exists in the taxonomy.
 *   - Invariant: no pattern is a per-case patch (no specific brand+model).
 */

import { describe, it, expect } from 'vitest';
import {
    extractEquipmentMentions,
    lookupTradeForSubcategory,
    EQUIPMENT_MENTION_PATTERNS_FOR_TESTING,
} from '../equipment-mentions';
import { TAXONOMY_SUBCATEGORIES } from '../diagnosis-trade-taxonomy';

describe('extractEquipmentMentions', () => {
    it('returns empty array for empty / null input', () => {
        expect(extractEquipmentMentions(null)).toEqual([]);
        expect(extractEquipmentMentions(undefined)).toEqual([]);
        expect(extractEquipmentMentions('')).toEqual([]);
        expect(extractEquipmentMentions('   ')).toEqual([]);
    });

    it('extracts a geyser mention from a typical complaint', () => {
        const mentions = extractEquipmentMentions(
            "the geyser's electricity rate has increased significantly, and its not holding its temperature",
        );
        expect(mentions.length).toBeGreaterThanOrEqual(1);
        const geyser = mentions.find((m) => m.subcategoryId === 'geyser_fault_plumbing');
        expect(geyser).toBeDefined();
        expect(geyser?.confidence).toBe('high');
    });

    it('extracts a gate motor mention', () => {
        const mentions = extractEquipmentMentions(
            'our gate motor stopped responding to the remote',
        );
        const gate = mentions.find((m) => m.subcategoryId === 'gate_motor_fault');
        expect(gate).toBeDefined();
        expect(gate?.confidence).toBe('high');
    });

    it('extracts a garage door mention separately from gate motor', () => {
        const gate = extractEquipmentMentions('the garage door is stuck halfway');
        expect(gate.find((m) => m.subcategoryId === 'garage_door_fault')).toBeDefined();
        expect(gate.find((m) => m.subcategoryId === 'gate_motor_fault')).toBeUndefined();
    });

    it('recognises SA brand context (Kwikot → geyser)', () => {
        const mentions = extractEquipmentMentions(
            'Kwikot KE45 has been leaking from the top',
        );
        const geyser = mentions.find((m) => m.subcategoryId === 'geyser_fault_plumbing');
        expect(geyser).toBeDefined();
        expect(geyser?.brandHint).toBe('geyser-brand');
    });

    it('recognises Centurion as gate motor brand context', () => {
        const mentions = extractEquipmentMentions(
            'Centurion gate motor making a clicking sound',
        );
        expect(
            mentions.some((m) => m.subcategoryId === 'gate_motor_fault'),
        ).toBe(true);
    });

    it('picks up mentions in conversation history', () => {
        const mentions = extractEquipmentMentions(
            'is the diagnosis correct?',
            ['the geyser is leaking water in the drip tray'],
        );
        expect(
            mentions.some((m) => m.subcategoryId === 'geyser_fault_plumbing'),
        ).toBe(true);
    });

    it('routes "blocked drain" to blocked_drain subcategory', () => {
        const mentions = extractEquipmentMentions('the kitchen drain is blocked');
        expect(
            mentions.some((m) => m.subcategoryId === 'blocked_drain'),
        ).toBe(true);
    });

    it('routes "DB board" / "breaker tripping" to db_board_tripping', () => {
        const m1 = extractEquipmentMentions('the DB board keeps tripping');
        expect(
            m1.some((m) => m.subcategoryId === 'db_board_tripping'),
        ).toBe(true);
        const m2 = extractEquipmentMentions('the breaker keeps tripping');
        expect(
            m2.some((m) => m.subcategoryId === 'db_board_tripping'),
        ).toBe(true);
    });

    it('routes "burst pipe" to burst_pipe_leak', () => {
        const mentions = extractEquipmentMentions('we have a burst pipe in the wall');
        expect(
            mentions.some((m) => m.subcategoryId === 'burst_pipe_leak'),
        ).toBe(true);
    });

    it('returns a brand hint when the matched phrase is a brand', () => {
        const mentions = extractEquipmentMentions('the Centurion stopped working');
        const m = mentions.find((m) => m.subcategoryId === 'gate_motor_fault');
        expect(m?.brandHint).toBe('gate-motor-brand');
    });
});

describe('lookupTradeForSubcategory', () => {
    it('returns the canonical trade for a known subcategory', () => {
        expect(lookupTradeForSubcategory('geyser_fault_plumbing')).toBe('Plumbing');
        expect(lookupTradeForSubcategory('gate_motor_fault')).toBe('Security');
        expect(lookupTradeForSubcategory('db_board_tripping')).toBe('Electrical');
    });

    it('returns null for an unknown subcategory', () => {
        expect(lookupTradeForSubcategory('nonsense_id_does_not_exist')).toBeNull();
    });
});

describe('invariants', () => {
    it('every equipment pattern maps to a real taxonomy subcategory', () => {
        const taxonomyIds = new Set(TAXONOMY_SUBCATEGORIES.map((r) => r.id));
        for (const pattern of EQUIPMENT_MENTION_PATTERNS_FOR_TESTING) {
            expect(
                taxonomyIds.has(pattern.subcategoryId),
                `Pattern targets subcategoryId "${pattern.subcategoryId}" which does not exist in TAXONOMY_SUBCATEGORIES. Add the subcategory first, or fix the pattern.`,
            ).toBe(true);
        }
    });

    it('no pattern contains an obvious per-case patch marker', () => {
        // Per-case patches are usually identifiable by hyper-specific
        // brand+model combinations (e.g. "Kwikot KE45 200L blue"). We
        // forbid those — a brand alone is OK as a hint, but a specific
        // model variant is Bucket A.
        for (const p of EQUIPMENT_MENTION_PATTERNS_FOR_TESTING) {
            const src = p.match.source;
            // Heuristic: a digit followed by 'L' or 'lt' is a capacity (per-case smell).
            // A digit-only is a model number (per-case smell).
            expect(
                /\b\d{2,}\s?(l|lt|litres?)\b/i.test(src),
                `Pattern "${src}" looks like a per-case capacity patch.`,
            ).toBe(false);
        }
    });
});
