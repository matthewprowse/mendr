/**
 * Phase 5 — unit tests for the taxonomy serializer.
 *
 * Confirms the structured block produced from TAXONOMY_SUBCATEGORIES is well
 * formed, contains the disambiguation pairs the Phase 5 taxonomy edits added
 * (A1-A4), and reflects EXCLUDED_SERVICES verbatim.
 */

import { describe, expect, it } from 'vitest';
import {
    buildAllBucketBBlocks,
    buildExcludedServicesBlock,
    buildSupportedServicesBlock,
    buildTaxonomyPromptBlock,
} from '@/features/diagnosis/prompts/taxonomy-serializer';
import { EXCLUDED_SERVICES, SERVICE_LABELS } from '@/lib/services';

describe('buildTaxonomyPromptBlock', () => {
    const block = buildTaxonomyPromptBlock();

    it('starts with the TRADE TAXONOMY heading', () => {
        expect(block.startsWith('TRADE TAXONOMY')).toBe(true);
    });

    it('contains every supported trade as a section header', () => {
        for (const trade of SERVICE_LABELS) {
            expect(block).toContain(`\n${trade}\n`);
        }
    });

    it('contains the pool ↔ borehole ↔ irrigation disambiguation (Phase 5 A1)', () => {
        expect(block).toMatch(
            /pool_pump_filter[\s\S]+Excludes:[\s\S]+water_pressure_supply/,
        );
        expect(block).toMatch(
            /pool_pump_filter[\s\S]+Excludes:[\s\S]+irrigation_system/,
        );
    });

    it('contains the reciprocal borehole-side disambiguation (Phase 5 A2)', () => {
        expect(block).toMatch(
            /water_pressure_supply[\s\S]+Excludes:[\s\S]+pool_pump_filter/,
        );
    });

    it('contains the reciprocal irrigation-side disambiguation (Phase 5 A3)', () => {
        expect(block).toMatch(
            /irrigation_system[\s\S]+Excludes:[\s\S]+pool_pump_filter/,
        );
    });

    it('contains the building_extensions whole-room rebuild scope extension (Phase 5 A4)', () => {
        expect(block).toMatch(
            /building_extensions[\s\S]+kitchen.+bathroom.+fully gutted and rebuilt/,
        );
    });

    it('contains the canonical gate ↔ garage door disambiguation (already in taxonomy)', () => {
        expect(block).toMatch(
            /gate_motor_fault[\s\S]+Excludes:[\s\S]+garage_door_fault/,
        );
    });
});

describe('buildSupportedServicesBlock', () => {
    it('lists every canonical service label exactly once', () => {
        const block = buildSupportedServicesBlock();
        for (const label of SERVICE_LABELS) {
            expect(block).toContain(label);
        }
    });
});

describe('buildExcludedServicesBlock', () => {
    it('lists every EXCLUDED_SERVICES entry', () => {
        const block = buildExcludedServicesBlock();
        for (const entry of EXCLUDED_SERVICES) {
            expect(block).toContain(entry);
        }
    });
});

describe('buildAllBucketBBlocks', () => {
    it('combines all three blocks separated by blank lines', () => {
        const combined = buildAllBucketBBlocks();
        expect(combined).toContain('SUPPORTED TRADES');
        expect(combined).toContain('EXPLICITLY UNSERVICED');
        expect(combined).toContain('TRADE TAXONOMY');
    });
});
