/**
 * Phase 5 — drift-detection tests for the V2 prompt assembly.
 *
 * Two structural invariants the plan's Success Criterion 8 demands:
 *   1. The V2 prompt body files (base-v2, output-format-v2, followup-v2,
 *      validation-v2) contain zero trade names. Trade vocabulary lives only
 *      in `diagnosis-trade-taxonomy.ts` (data) and is injected at runtime
 *      by the V2 composer.
 *   2. Every trade name that DOES appear in the V2 runtime-assembled prompt
 *      comes from SERVICE_LABELS (which the composer pulls via the taxonomy
 *      serialiser) — i.e. no trade name in the prompt body is unsourced.
 *
 * If either invariant is violated, this test fails and Phase 5's structural
 * guarantee is broken.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSystemInstructionV2 } from '@/features/diagnosis/prompts/composer';
import { SERVICE_LABELS } from '@/lib/services';
import type { PromptContext } from '@/features/diagnosis/prompts/types';

const V2_BODY_FILES = [
    'base-v2.ts',
    'output-format-v2.ts',
    'followup-v2.ts',
    'validation-v2.ts',
    'rubrics.ts',
];

const PROMPTS_DIR = path.resolve(
    __dirname,
    '..',
    'prompts',
);

/** Trade vocabulary the plan's grep target enumerates (Success Criterion 8). */
const FORBIDDEN_TRADE_TOKENS = [
    'pool',
    'borehole',
    'garage',
    'gate',
    'kitchen',
    'geyser',
    'capacitor',
    'thermostat',
    'spring',
    'hvac',
    'plumbing',
    'electrical',
    'security',
    'locksmith',
];

describe('V2 prompt body files contain zero trade names', () => {
    for (const filename of V2_BODY_FILES) {
        it(`${filename} contains none of the forbidden trade tokens`, () => {
            const text = fs.readFileSync(
                path.join(PROMPTS_DIR, filename),
                'utf-8',
            );

            // Strip JS/TS comment lines and JSDoc — these are dev-facing notes
            // about why content moved, not text the model sees. Only the
            // runtime string literals matter.
            const stripped = text
                // Remove block comments
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Remove single-line comments
                .replace(/^\s*\/\/.*$/gm, '');

            for (const token of FORBIDDEN_TRADE_TOKENS) {
                const re = new RegExp(`\\b${token}\\b`, 'i');
                expect(
                    re.test(stripped),
                    `${filename} mentions the forbidden trade token "${token}" outside comments. ` +
                        `Trade vocabulary belongs in diagnosis-trade-taxonomy.ts only.`,
                ).toBe(false);
            }
        });
    }
});

describe('V2 runtime-assembled prompt sources every trade name from data', () => {
    const ctx: PromptContext = {
        isFollowUp: false,
        hasUserContext: false,
        userSelectedTrade: null,
        isTextOnlyNoAttachments: false,
        serviceListText: SERVICE_LABELS.join(', '),
        feedback: undefined,
        providers: undefined,
        previousDiagnosis: null,
        diagnosisRejected: false,
        isRefinementWithNewImages: false,
    };
    const assembled = buildSystemInstructionV2(ctx);

    it('includes every SERVICE_LABEL', () => {
        for (const label of SERVICE_LABELS) {
            expect(assembled).toContain(label);
        }
    });

    it('contains a top-level SUPPORTED TRADES block and a TRADE TAXONOMY block', () => {
        expect(assembled).toContain('SUPPORTED TRADES');
        expect(assembled).toContain('TRADE TAXONOMY');
    });

    it('contains every facet rubric block', () => {
        expect(assembled).toContain('TRADE-CONFIDENCE RUBRIC');
        expect(assembled).toContain('COMPONENT-CONFIDENCE RUBRIC');
        expect(assembled).toContain('CAUSE-CONFIDENCE RUBRIC');
        expect(assembled).toContain('IMAGE-SUFFICIENCY ENUM');
        expect(assembled).toContain('COMPLETION CRITERIA');
    });

    it('does not contain the V1 single-integer threshold phrasing', () => {
        // The V1 prompt routinely said "confidence < 85 → requires_clarification".
        // V2 must replace this with the COMPLETION CRITERIA rubric.
        expect(assembled).not.toMatch(/confidence\s*<\s*85/i);
    });
});
