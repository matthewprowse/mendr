/**
 * Diagnostic Accuracy Eval Suite — runner.
 *
 * Phase 3 of `docs/Diagnostic-Accuracy-Hardening-Plan.md`.
 *
 * What this suite does TODAY:
 *   1. Loads every fixture under `fixtures/**\/*.json`.
 *   2. Validates fixture shape and that the `subcategory_id` actually exists
 *      in the live `TAXONOMY_SUBCATEGORIES` constant.
 *   3. Asserts the fixture's `trade` matches the taxonomy row's trade —
 *      catches drift between fixtures and the production taxonomy.
 *   4. For unverified fixtures, marks them `it.skip` so they stay visible in
 *      the test report but do not gate CI.
 *   5. Cross-checks `baseline.json` against the fixture catalogue.
 *
 * What this suite does NOT do yet:
 *   - Actually invoke the Gemini diagnosis pipeline. That arrives once we
 *     have 50+ verified fixtures (per Phase 3 plan). The runner is set up
 *     so that switch-over is a single function call.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
    TAXONOMY_SUBCATEGORIES,
    getSubcategoryById,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';

import { loadAllFixtures, type LoadedFixture } from './fixture-loader';
import type { AccuracyBaseline, AccuracyFixture } from './types';

const ALL_FIXTURES: LoadedFixture[] = loadAllFixtures();

const BASELINE: AccuracyBaseline = JSON.parse(
    readFileSync(join(__dirname, 'baseline.json'), 'utf-8')
) as AccuracyBaseline;

/**
 * Stub for the future pipeline call. When 50+ verified fixtures land, this
 * is the only function that needs to be implemented — it should run the
 * production Agent 2a + 2b sequence against the fixture inputs and return
 * the diagnosis for assertion.
 */
async function runDiagnosticPipelineStub(_fixture: AccuracyFixture): Promise<{ stub: true }> {
    return { stub: true };
}

describe('diagnostic-accuracy / fixture catalogue', () => {
    it('discovers at least one fixture', () => {
        expect(ALL_FIXTURES.length).toBeGreaterThan(0);
    });

    it('all fixture ids are unique', () => {
        const ids = ALL_FIXTURES.map((f) => f.fixture.id);
        const set = new Set(ids);
        expect(set.size).toBe(ids.length);
    });

    it('baseline.json passing[] only references known fixtures', () => {
        const known = new Set(ALL_FIXTURES.map((f) => f.fixture.id));
        for (const id of BASELINE.passing) {
            expect(known.has(id), `baseline.passing has unknown fixture id "${id}"`).toBe(true);
        }
    });

    it('baseline.json expected_failures[] only references known fixtures', () => {
        const known = new Set(ALL_FIXTURES.map((f) => f.fixture.id));
        for (const id of BASELINE.expected_failures) {
            expect(
                known.has(id),
                `baseline.expected_failures has unknown fixture id "${id}"`
            ).toBe(true);
        }
    });

    it('baseline.json passing and expected_failures are disjoint', () => {
        const overlap = BASELINE.passing.filter((id) => BASELINE.expected_failures.includes(id));
        expect(overlap).toEqual([]);
    });
});

describe('diagnostic-accuracy / taxonomy alignment', () => {
    for (const { relativePath, fixture } of ALL_FIXTURES) {
        describe(relativePath, () => {
            it('subcategory_id exists in TAXONOMY_SUBCATEGORIES', () => {
                const row = getSubcategoryById(fixture.ground_truth.subcategory_id);
                expect(
                    row,
                    `subcategory_id "${fixture.ground_truth.subcategory_id}" not found in TAXONOMY_SUBCATEGORIES`
                ).toBeDefined();
            });

            it('trade matches taxonomy row', () => {
                const row = getSubcategoryById(fixture.ground_truth.subcategory_id);
                if (!row) return; // covered by previous assertion
                expect(fixture.ground_truth.trade).toBe(row.trade);
            });

            it('if failure_mode_id is set, it exists in the subcategory failureModes catalog', () => {
                const fmId = fixture.ground_truth.failure_mode_id;
                if (!fmId) return;
                const row = getSubcategoryById(fixture.ground_truth.subcategory_id);
                if (!row) return;
                const modes = row.failureModes ?? [];
                const found = modes.find((m) => m.id === fmId);
                expect(
                    found,
                    `failure_mode_id "${fmId}" not found in ${fixture.ground_truth.subcategory_id}.failureModes`
                ).toBeDefined();
            });

            it('confidence_floor is a sensible value', () => {
                expect(fixture.ground_truth.confidence_floor).toBeGreaterThanOrEqual(0);
                expect(fixture.ground_truth.confidence_floor).toBeLessThanOrEqual(100);
            });
        });
    }

    it('exposes TAXONOMY_SUBCATEGORIES to the suite (sanity)', () => {
        // Guards against a refactor that empties the taxonomy export.
        expect(TAXONOMY_SUBCATEGORIES.length).toBeGreaterThan(0);
    });
});

describe('diagnostic-accuracy / pipeline runs', () => {
    for (const { relativePath, fixture } of ALL_FIXTURES) {
        if (fixture.verified) {
            it(`${relativePath} runs against the diagnostic pipeline`, async () => {
                // Stub for now — real pipeline arrives once 50+ verified
                // fixtures exist. See plan §Phase 3.
                const result = await runDiagnosticPipelineStub(fixture);
                expect(result).toBeDefined();
            });
        } else {
            // Unverified fixtures are visible but skipped — CI must not gate
            // on them until a contractor has signed off on the ground truth.
            it.skip(`${relativePath} (skipped — verified=false)`, () => {
                // intentional skip
            });
        }
    }
});
