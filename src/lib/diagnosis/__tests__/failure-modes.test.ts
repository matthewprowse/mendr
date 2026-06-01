/**
 * Invariant tests for the Phase 2 `failureModes` content in
 * `diagnosis-trade-taxonomy.ts`. These guard the bootstrap content as it lands
 * subcategory-by-subcategory ahead of contractor verification.
 *
 * The invariants intentionally do NOT assert on copy — only on shape, so the
 * domain content can evolve without the tests churning.
 */

import { describe, expect, it } from 'vitest';

import {
    TAXONOMY_SUBCATEGORIES,
    getSubcategoryById,
    type FailureMode,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';

/** Subcategories that have been populated as part of Phase 2 wave 1. */
const POPULATED_SUBCATEGORY_IDS = [
    'geyser_fault_plumbing',
    'garage_door_fault',
    'gate_motor_fault',
    'db_board_tripping',
    'pool_pump_filter',
    'burst_pipe_leak',
] as const;

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

describe('Phase 2 failureModes — populated subcategories', () => {
    for (const subcategoryId of POPULATED_SUBCATEGORY_IDS) {
        describe(subcategoryId, () => {
            const row = getSubcategoryById(subcategoryId);

            it('exists in the taxonomy', () => {
                expect(row).toBeDefined();
            });

            it('has failureModes populated with length >= 3', () => {
                expect(row?.failureModes).toBeDefined();
                expect(row?.failureModes?.length ?? 0).toBeGreaterThanOrEqual(3);
            });

            it('every failure mode has at least 4 diagnostic cues', () => {
                for (const mode of row?.failureModes ?? []) {
                    expect(
                        mode.diagnosticCues.length,
                        `mode "${mode.id}" should have >=4 cues`,
                    ).toBeGreaterThanOrEqual(4);
                }
            });

            it('every failure mode has verified === false (until contractor review)', () => {
                for (const mode of row?.failureModes ?? []) {
                    expect(mode.verified, `mode "${mode.id}" verified flag`).toBe(false);
                }
            });

            it('all failure mode IDs within the subcategory are unique', () => {
                const ids = (row?.failureModes ?? []).map((m) => m.id);
                expect(new Set(ids).size).toBe(ids.length);
            });

            it('all failure mode IDs are kebab-case', () => {
                for (const mode of row?.failureModes ?? []) {
                    expect(
                        KEBAB_CASE.test(mode.id),
                        `mode id "${mode.id}" must be kebab-case`,
                    ).toBe(true);
                }
            });
        });
    }
});

describe('FailureMode shape — global invariants', () => {
    const allFailureModes: { subcategoryId: string; mode: FailureMode }[] = [];
    for (const row of TAXONOMY_SUBCATEGORIES) {
        for (const mode of row.failureModes ?? []) {
            allFailureModes.push({ subcategoryId: row.id, mode });
        }
    }

    it('every populated subcategory uses valid costBand values', () => {
        const allowed = new Set(['minor', 'medium', 'major', 'replacement']);
        for (const { subcategoryId, mode } of allFailureModes) {
            expect(
                allowed.has(mode.typicalRepair.costBand),
                `${subcategoryId}/${mode.id} costBand`,
            ).toBe(true);
        }
    });

    it('every populated subcategory uses valid urgency values', () => {
        const allowed = new Set(['now', 'soon', 'planned']);
        for (const { subcategoryId, mode } of allFailureModes) {
            expect(
                allowed.has(mode.urgency),
                `${subcategoryId}/${mode.id} urgency`,
            ).toBe(true);
        }
    });

    it('every cue uses a valid type', () => {
        const allowed = new Set(['visual', 'verbal', 'contextual']);
        for (const { subcategoryId, mode } of allFailureModes) {
            for (const cue of mode.diagnosticCues) {
                expect(
                    allowed.has(cue.type),
                    `${subcategoryId}/${mode.id} cue type`,
                ).toBe(true);
            }
        }
    });

    it('every label and description is non-empty', () => {
        for (const { subcategoryId, mode } of allFailureModes) {
            expect(mode.label.trim().length, `${subcategoryId}/${mode.id} label`).toBeGreaterThan(0);
            expect(
                mode.description.trim().length,
                `${subcategoryId}/${mode.id} description`,
            ).toBeGreaterThan(0);
            expect(
                mode.typicalRepair.summary.trim().length,
                `${subcategoryId}/${mode.id} typicalRepair.summary`,
            ).toBeGreaterThan(0);
        }
    });
});
