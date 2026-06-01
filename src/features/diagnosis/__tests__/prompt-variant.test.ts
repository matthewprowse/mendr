/**
 * Prompt-variant regression guards.
 *
 * Session 1 contract: every v3.5 builder currently delegates to its v2.5
 * counterpart. So for the same inputs, the resolver must produce IDENTICAL
 * strings regardless of variant. These tests lock that contract in — they
 * MUST fail the moment v3.5 intentionally diverges (Session 3+ tuning), at
 * which point the assertion is updated to "must be ≠" or removed.
 *
 * Also covers variant resolution rules (env, override, model-name inference).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    resolveVariant,
    getClassificationSystemPrompt,
    getProseSystemPrompt,
    getReasoningSystemPrompt,
    getCritiqueSystemPrompt,
    getClassifySamplingParams,
    getProseSamplingParams,
    getReasoningSamplingParams,
    getCritiqueSamplingParams,
} from '@/features/diagnosis/prompts/variants/prompt-variant';
import { FALLBACK_CLASSIFICATION } from '@/features/diagnosis/agent-classify';

// Track B draft variants — NOT wired into the resolver yet. Imported directly
// so the regression tests exercise the builders. Once the user wires these
// into prompt-variant.ts, they can additionally be reached through the
// resolver getters (and these direct-import tests stay valid).
import { buildClassificationSystemPrompt_v25_polished } from '@/features/diagnosis/prompts/variants/v2_5_polished/classification-system-prompt';
import { buildProseSystemPrompt_v25_polished } from '@/features/diagnosis/prompts/variants/v2_5_polished/prose-system-prompt';
import {
    SAMPLING_CLASSIFY_V25_POLISHED,
    samplingProseV25Polished,
    SAMPLING_REASONING_V25_POLISHED,
    SAMPLING_CRITIQUE_V25_POLISHED,
} from '@/features/diagnosis/prompts/variants/v2_5_polished/sampling-params';
import { buildClassificationSystemPrompt_v35_native } from '@/features/diagnosis/prompts/variants/v3_5_native/classification-system-prompt';
import {
    buildProseSystemPrompt_v35_native,
    buildProseSystemPrompt_v35_native_static,
    buildProseSystemPrompt_v35_native_dynamic,
} from '@/features/diagnosis/prompts/variants/v3_5_native/prose-system-prompt';
import {
    SAMPLING_CLASSIFY_V35_NATIVE,
    samplingProseV35Native,
    SAMPLING_REASONING_V35_NATIVE,
    SAMPLING_CRITIQUE_V35_NATIVE,
} from '@/features/diagnosis/prompts/variants/v3_5_native/sampling-params';

const SAMPLE_SERVICE_LIST = '- Electrical\n- Plumbing\n- Security';

describe('resolveVariant', () => {
    const ORIGINAL_ENV = { ...process.env };
    beforeEach(() => {
        delete process.env.DIAGNOSIS_PROMPT_VARIANT;
        delete process.env.GEMINI_DIAGNOSIS_MODEL;
    });
    afterEach(() => {
        process.env = ORIGINAL_ENV;
    });

    it('honours explicit override over everything else', () => {
        process.env.GEMINI_DIAGNOSIS_MODEL = 'gemini-3.5-flash';
        process.env.DIAGNOSIS_PROMPT_VARIANT = 'v3.5';
        expect(resolveVariant({ override: 'v2.5' })).toBe('v2.5');
    });

    it('honours DIAGNOSIS_PROMPT_VARIANT env over model inference', () => {
        process.env.GEMINI_DIAGNOSIS_MODEL = 'gemini-3.5-flash';
        process.env.DIAGNOSIS_PROMPT_VARIANT = 'v2.5';
        expect(resolveVariant()).toBe('v2.5');
    });

    it('infers v3.5 from gemini-3.x model name', () => {
        expect(resolveVariant({ model: 'gemini-3.5-flash' })).toBe('v3.5');
        expect(resolveVariant({ model: 'gemini-3.0-pro' })).toBe('v3.5');
    });

    it('infers v2.5 for gemini-2.x and unknown models', () => {
        expect(resolveVariant({ model: 'gemini-2.5-flash' })).toBe('v2.5');
        expect(resolveVariant({ model: 'gemini-2.0-flash' })).toBe('v2.5');
        expect(resolveVariant({ model: 'gemini-1.5-flash' })).toBe('v2.5');
        expect(resolveVariant({ model: 'gemini-4-flash' })).toBe('v2.5'); // future default
    });

    it('defaults to v2.5 when no signal is available', () => {
        expect(resolveVariant()).toBe('v2.5');
    });

    it('ignores junk env values', () => {
        process.env.DIAGNOSIS_PROMPT_VARIANT = 'v9.9';
        expect(resolveVariant({ model: 'gemini-2.5-flash' })).toBe('v2.5');
    });
});

describe('Session 1 byte-identity guard — v3.5 must equal v2.5', () => {
    // Update these assertions to .not.toBe() / .not.toEqual() the moment a
    // v3.5 builder intentionally diverges in Session 3+ tuning.

    // Classifier diverged in v3.5 tuning iter 1 (2026-05-27). v3.5 has its
    // own commit-rule framing, confidence calibration bands, and worked
    // examples. We assert non-equality here PLUS that v3.5 still contains the
    // structural anchors so a future refactor doesn't accidentally regress
    // the schema-relevant content.
    it('classification system prompt differs across variants (v3.5 has its own copy)', () => {
        const v25 = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, { variant: 'v2.5' });
        const v35 = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, { variant: 'v3.5' });
        expect(v35).not.toBe(v25);
    });

    it('v3.5 classifier prompt still includes the taxonomy block + service list', () => {
        const v35 = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, { variant: 'v3.5' });
        // The service list passes through verbatim
        expect(v35).toContain(SAMPLE_SERVICE_LIST);
        // The taxonomy block is injected
        expect(v35).toContain('ROUTING SUBCATEGORIES');
        // The hard "commit" rule is present (iter-1 hypothesis)
        expect(v35).toContain('COMMIT RULE');
        // ONE worked example (iter 1.1 trimmed back from 3 to 1)
        expect(v35).toContain('EXAMPLE');
        // Confidence band wording reflects the equipment vs failure split
        expect(v35).toContain('EQUIPMENT + SUBCATEGORY');
    });

    it('v3.5 classifier prompt stays in the same length-order as v2.5 (iter 1.1 budget)', () => {
        // iter 1.0 was ~30% longer than v2.5 and caused JSON-parse failures
        // on 3.5 Flash. iter 1.1 targets ≤+5%. Tripwire: anything beyond
        // +15% means we've drifted back into the over-verbose territory.
        const v25 = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, { variant: 'v2.5' });
        const v35 = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, { variant: 'v3.5' });
        const ratio = v35.length / v25.length;
        expect(ratio).toBeLessThan(1.15);
    });

    it('prose system prompt is identical across variants', () => {
        const v25 = getProseSystemPrompt(FALLBACK_CLASSIFICATION, 'BASE', { variant: 'v2.5' });
        const v35 = getProseSystemPrompt(FALLBACK_CLASSIFICATION, 'BASE', { variant: 'v3.5' });
        expect(v35).toBe(v25);
    });

    it('reasoning system prompt is identical across variants (round 1)', () => {
        const v25 = getReasoningSystemPrompt(1, undefined, { variant: 'v2.5' });
        const v35 = getReasoningSystemPrompt(1, undefined, { variant: 'v3.5' });
        expect(v35).toBe(v25);
    });

    it('reasoning system prompt is identical across variants (round 2 with prior context)', () => {
        const v25 = getReasoningSystemPrompt(2, 'PRIOR CONTEXT', { variant: 'v2.5' });
        const v35 = getReasoningSystemPrompt(2, 'PRIOR CONTEXT', { variant: 'v3.5' });
        expect(v35).toBe(v25);
    });

    it('critique system prompt is identical across variants', () => {
        const args = { outcome: 'committed' as const, round: 1 as const };
        const v25 = getCritiqueSystemPrompt(args, { variant: 'v2.5' });
        const v35 = getCritiqueSystemPrompt(args, { variant: 'v3.5' });
        expect(v35).toBe(v25);
    });

    it('classify sampling params: v3.5 has higher maxOutputTokens (iter 2 hypothesis)', () => {
        const v25 = getClassifySamplingParams({ variant: 'v2.5' });
        const v35 = getClassifySamplingParams({ variant: 'v3.5' });
        // Same temperature/topK/topP — only maxOutputTokens differs
        expect(v35.temperature).toBe(v25.temperature);
        expect(v35.topK).toBe(v25.topK);
        expect(v35.topP).toBe(v25.topP);
        // v3.5 bumped to fit 3.5 Flash's thinking-token overhead before output
        expect(v35.maxOutputTokens).toBeGreaterThan(v25.maxOutputTokens);
        expect(v35.maxOutputTokens).toBe(2000);
    });

    it('prose sampling params are identical across variants (both isProviderHydration values)', () => {
        for (const isProviderHydration of [true, false]) {
            const v25 = getProseSamplingParams({ variant: 'v2.5' }, { isProviderHydration });
            const v35 = getProseSamplingParams({ variant: 'v3.5' }, { isProviderHydration });
            expect(v35).toEqual(v25);
        }
    });

    it('reasoning sampling params are identical across variants', () => {
        const v25 = getReasoningSamplingParams({ variant: 'v2.5' });
        const v35 = getReasoningSamplingParams({ variant: 'v3.5' });
        expect(v35).toEqual(v25);
    });

    it('critique sampling params are identical across variants', () => {
        const v25 = getCritiqueSamplingParams({ variant: 'v2.5' });
        const v35 = getCritiqueSamplingParams({ variant: 'v3.5' });
        expect(v35).toEqual(v25);
    });
});

describe('Session 1 sampling-param values match the previous inline literals', () => {
    // Tripwire: if anyone tweaks the v2.5 sampling params, this test surfaces
    // it. The values here were the inline literals before Session 1's
    // extraction.

    it('classify v2.5 = inline literal {temp 0.1, topK 10, topP 0.6, maxTok 520}', () => {
        expect(getClassifySamplingParams({ variant: 'v2.5' })).toEqual({
            temperature: 0.1,
            topK: 10,
            topP: 0.6,
            maxOutputTokens: 520,
        });
    });

    it('prose v2.5 = inline literal (isProviderHydration:false => temp 0.35)', () => {
        expect(getProseSamplingParams({ variant: 'v2.5' }, { isProviderHydration: false })).toEqual({
            temperature: 0.35,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 4000,
        });
    });

    it('prose v2.5 = inline literal (isProviderHydration:true => temp 0.22)', () => {
        expect(getProseSamplingParams({ variant: 'v2.5' }, { isProviderHydration: true })).toEqual({
            temperature: 0.22,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 4000,
        });
    });

    it('reasoning v2.5 = inline literal {temp 0.2, topK 20, topP 0.8, maxTok 1200}', () => {
        expect(getReasoningSamplingParams({ variant: 'v2.5' })).toEqual({
            temperature: 0.2,
            topK: 20,
            topP: 0.8,
            maxOutputTokens: 1200,
        });
    });

    it('critique v2.5 = inline literal {temp 0.1, topK 20, topP 0.8, maxTok 1500}', () => {
        expect(getCritiqueSamplingParams({ variant: 'v2.5' })).toEqual({
            temperature: 0.1,
            topK: 20,
            topP: 0.8,
            maxOutputTokens: 1500,
        });
    });
});

// ───────────────────────────────────────────────────────────────────────────
// Track B draft variants — v2.5_polished and v3.5_native
//
// These variants are NOT wired into the resolver yet (the user wires them
// manually after reviewing the diff). The tests below exercise the builders
// directly via their named exports.
// ───────────────────────────────────────────────────────────────────────────

describe('v2.5_polished — draft variant (Track B)', () => {
    describe('classification system prompt', () => {
        it('builder returns a string > 1000 chars', () => {
            const out = buildClassificationSystemPrompt_v25_polished(SAMPLE_SERVICE_LIST);
            expect(typeof out).toBe('string');
            expect(out.length).toBeGreaterThan(1000);
            expect(out.length).toBeLessThan(50_000);
        });

        it('contains the expected key markers', () => {
            const out = buildClassificationSystemPrompt_v25_polished(SAMPLE_SERVICE_LIST);
            expect(out).toContain(SAMPLE_SERVICE_LIST);
            // Taxonomy block is injected
            expect(out).toContain('ROUTING SUBCATEGORIES');
            // Equipment-vs-failure framing — the central polish hypothesis
            expect(out).toContain('EQUIPMENT + SUBCATEGORY');
            // Worked example for the partial-evidence pattern
            expect(out).toContain('CONFIDENCE EXAMPLE');
            // Original v2.5 commit / user-correction rule preserved
            expect(out).toContain('USER CORRECTIONS BEAT THE PHOTO');
            // Classifier doesn't emit prose — make sure we didn't accidentally
            // add prose-style instructions
            expect(out).not.toContain('image_descriptions');
        });

        it('length stays within +10% of v2.5 baseline', () => {
            const v25 = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, { variant: 'v2.5' });
            const polished = buildClassificationSystemPrompt_v25_polished(SAMPLE_SERVICE_LIST);
            const ratio = polished.length / v25.length;
            // Polish budget is "+10% max". We give 1.15 as the hard tripwire
            // (matches v3.5's drift-detection budget).
            expect(ratio).toBeLessThan(1.15);
        });
    });

    describe('prose system prompt', () => {
        it('builder returns a string > 1000 chars', () => {
            const out = buildProseSystemPrompt_v25_polished(FALLBACK_CLASSIFICATION, 'BASE');
            expect(typeof out).toBe('string');
            expect(out.length).toBeGreaterThan(1000);
            expect(out.length).toBeLessThan(50_000);
        });

        it('extends the v2.5 prose prompt with a CONCISION block', () => {
            const v25 = getProseSystemPrompt(FALLBACK_CLASSIFICATION, 'BASE', { variant: 'v2.5' });
            const polished = buildProseSystemPrompt_v25_polished(FALLBACK_CLASSIFICATION, 'BASE');
            // Polished prose strictly extends v2.5 — the v2.5 content appears
            // verbatim as a prefix (no rewriting, no removal).
            expect(polished.startsWith(v25)).toBe(true);
            // Polish-specific markers
            expect(polished).toContain('CONCISION RULES');
            expect(polished).toContain('BANNED PHRASING');
            // Title brevity cap (1-6 words)
            expect(polished).toContain('max 6 WORDS');
            // Image-description distinctness examples
            expect(polished).toContain('IMAGE_DESCRIPTIONS DISTINCTNESS');
        });

        it('preserves all existing structural blocks (symmetry would only fire on relevant subcategory)', () => {
            // Using FALLBACK_CLASSIFICATION which has subcategory_id="none_unmapped"
            // — symmetry block fires for unmapped + relevant subcategories.
            const polished = buildProseSystemPrompt_v25_polished(FALLBACK_CLASSIFICATION, 'BASE');
            // These structural blocks are owned by the v2.5 builder; we just
            // confirm they survived the wrap (sanity check that we didn't
            // accidentally override the v2.5 output).
            expect(polished).toContain('USER-IDENTIFIED CAUSE');
            expect(polished).toContain('USER-NAMED EQUIPMENT');
            expect(polished).toContain('CAUSE HIERARCHY');
        });
    });

    describe('sampling params', () => {
        it('classify matches v2.5 (no divergence yet for classify sampling)', () => {
            expect(SAMPLING_CLASSIFY_V25_POLISHED).toEqual(getClassifySamplingParams({ variant: 'v2.5' }));
        });

        it('prose temperature is slightly LOWER than v2.5 (concision pairing)', () => {
            const v25NonHydration = getProseSamplingParams(
                { variant: 'v2.5' },
                { isProviderHydration: false },
            );
            const polishedNonHydration = samplingProseV25Polished({ isProviderHydration: false });
            expect(polishedNonHydration.temperature).toBeLessThan(v25NonHydration.temperature);
            expect(polishedNonHydration.temperature).toBe(0.30);

            const v25Hydration = getProseSamplingParams(
                { variant: 'v2.5' },
                { isProviderHydration: true },
            );
            const polishedHydration = samplingProseV25Polished({ isProviderHydration: true });
            expect(polishedHydration.temperature).toBeLessThan(v25Hydration.temperature);
            expect(polishedHydration.temperature).toBe(0.20);
        });

        it('prose max output tokens unchanged from v2.5', () => {
            expect(samplingProseV25Polished({ isProviderHydration: false }).maxOutputTokens).toBe(4000);
            expect(samplingProseV25Polished({ isProviderHydration: true }).maxOutputTokens).toBe(4000);
        });

        it('reasoning and critique unchanged from v2.5', () => {
            expect(SAMPLING_REASONING_V25_POLISHED).toEqual(getReasoningSamplingParams({ variant: 'v2.5' }));
            expect(SAMPLING_CRITIQUE_V25_POLISHED).toEqual(getCritiqueSamplingParams({ variant: 'v2.5' }));
        });
    });
});

describe('v3.5_native — draft variant (Track B)', () => {
    describe('classification system prompt', () => {
        it('builder returns a string > 1000 chars', () => {
            const out = buildClassificationSystemPrompt_v35_native(SAMPLE_SERVICE_LIST);
            expect(typeof out).toBe('string');
            expect(out.length).toBeGreaterThan(1000);
            expect(out.length).toBeLessThan(50_000);
        });

        it('contains the expected key markers', () => {
            const out = buildClassificationSystemPrompt_v35_native(SAMPLE_SERVICE_LIST);
            expect(out).toContain(SAMPLE_SERVICE_LIST);
            // Taxonomy block is injected
            expect(out).toContain('ROUTING SUBCATEGORIES');
            // Explicit "use thinking budget" instruction — central to v3.5_native
            expect(out).toContain('USE YOUR FULL THINKING BUDGET');
            // No pre-specified confidence bands — dynamic thinking calibrates
            expect(out).not.toMatch(/95.*100:/);
            expect(out).not.toMatch(/85.*94:/);
            // Routing-focused framing (vs diagnostic-focused)
            expect(out).toContain('ROUTING');
        });

        it('is SHORTER than v3.5 — tighter rules-text', () => {
            // v3.5 iter 1.1 capped itself at ~+15% of v2.5. v3.5_native aims
            // to be SHORTER than v3.5 (3.5 with dynamic thinking doesn't
            // need as much rules-text).
            const v35 = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, { variant: 'v3.5' });
            const native = buildClassificationSystemPrompt_v35_native(SAMPLE_SERVICE_LIST);
            expect(native.length).toBeLessThan(v35.length);
        });
    });

    describe('prose system prompt — 5-stage protocol', () => {
        it('builder returns a string > 1000 chars', () => {
            const out = buildProseSystemPrompt_v35_native(FALLBACK_CLASSIFICATION, 'BASE');
            expect(typeof out).toBe('string');
            expect(out.length).toBeGreaterThan(1000);
            expect(out.length).toBeLessThan(50_000);
        });

        it('contains all five protocol stage headers', () => {
            const out = buildProseSystemPrompt_v35_native(FALLBACK_CLASSIFICATION, 'BASE');
            expect(out).toContain('STAGE A');
            expect(out).toContain('STAGE B');
            expect(out).toContain('STAGE C');
            expect(out).toContain('STAGE D');
            expect(out).toContain('STAGE E');
            expect(out).toContain('EQUIPMENT IDENTIFICATION');
            expect(out).toContain('FAILURE-MODE ENUMERATION');
            expect(out).toContain('ADJUDICATION');
            expect(out).toContain('SELF-CORRECTION');
            expect(out).toContain('OUTPUT FORMATTING');
        });

        it('locks the routing-classification fields in', () => {
            const out = buildProseSystemPrompt_v35_native(FALLBACK_CLASSIFICATION, 'BASE');
            expect(out).toContain('CLASSIFICATION — LOCKED IN');
            expect(out).toContain(`subcategory_id: ${FALLBACK_CLASSIFICATION.subcategory_id}`);
        });

        it('includes the base system instruction', () => {
            const out = buildProseSystemPrompt_v35_native(
                FALLBACK_CLASSIFICATION,
                'CUSTOM_BASE_INSTRUCTION_SENTINEL',
            );
            expect(out).toContain('CUSTOM_BASE_INSTRUCTION_SENTINEL');
        });

        it('includes user-cause / user-named-equipment guidance when not rejected', () => {
            const out = buildProseSystemPrompt_v35_native(FALLBACK_CLASSIFICATION, 'BASE');
            // FALLBACK has rejected=false, unserviced=false → user-cause
            // block should be present.
            expect(out).toContain('USER-IDENTIFIED CAUSE');
            expect(out).toContain('USER-NAMED EQUIPMENT');
        });

        it('emits structured-clarification guidance when requires_clarification=true', () => {
            // FALLBACK has requires_clarification=true → structured-clarif
            // block fires.
            const out = buildProseSystemPrompt_v35_native(FALLBACK_CLASSIFICATION, 'BASE');
            expect(out).toContain('STRUCTURED CLARIFICATION');
        });

        // ── Static / dynamic split (cost-cut Deliverable 2) ──────────────
        describe('static / dynamic split — Gemini-cache amortisation', () => {
            it('static portion contains call-invariant protocol + user-cause + concision blocks', () => {
                const staticPart = buildProseSystemPrompt_v35_native_static();
                expect(staticPart).toContain('DIAGNOSTIC PROTOCOL');
                expect(staticPart).toContain('USER-IDENTIFIED CAUSE');
                expect(staticPart).toContain('USER-NAMED EQUIPMENT');
                expect(staticPart).toContain('STAGE A');
                expect(staticPart).toContain('STAGE E');
                expect(staticPart).toContain('BRITISH-ENGLISH');
            });

            it('static portion does NOT vary with classification (cacheability check)', () => {
                const a = buildProseSystemPrompt_v35_native_static();
                const b = buildProseSystemPrompt_v35_native_static();
                expect(a).toBe(b);
            });

            it('dynamic portion contains the locked-in classification block + base instruction', () => {
                const dynamic = buildProseSystemPrompt_v35_native_dynamic(
                    FALLBACK_CLASSIFICATION,
                    'BASE',
                );
                expect(dynamic).toContain('BASE');
                expect(dynamic).toContain('CLASSIFICATION — LOCKED IN');
                expect(dynamic).toContain(
                    `subcategory_id: ${FALLBACK_CLASSIFICATION.subcategory_id}`,
                );
            });

            it('static + dynamic concatenated equals the backward-compat single-string output', () => {
                const combined = buildProseSystemPrompt_v35_native(
                    FALLBACK_CLASSIFICATION,
                    'BASE',
                );
                const dynamic = buildProseSystemPrompt_v35_native_dynamic(
                    FALLBACK_CLASSIFICATION,
                    'BASE',
                );
                const staticPart = buildProseSystemPrompt_v35_native_static();
                // Compose in the same order the single-string entry point uses.
                const composed = [dynamic, staticPart]
                    .filter((s) => s && s.trim().length > 0)
                    .join('\n\n');
                expect(combined).toBe(composed);
            });
        });
    });

    describe('sampling params — dynamic thinking + 8K prose output', () => {
        it('classify omits thinkingConfig (2.0 Flash Lite does not support it)', () => {
            // Mixed-tier cost-cut Deliverable 1: classifier now runs on
            // gemini-2.0-flash-lite which doesn't support thinkingConfig.
            expect(SAMPLING_CLASSIFY_V35_NATIVE.thinkingConfig).toBeUndefined();
        });

        it('classify maxOutputTokens is 1500 (trimmed for 2.0 Flash Lite — no hidden thinking-budget burn)', () => {
            expect(SAMPLING_CLASSIFY_V35_NATIVE.maxOutputTokens).toBe(1500);
        });

        it('prose thinkingBudget is -1 (auto)', () => {
            const nonHydration = samplingProseV35Native({ isProviderHydration: false });
            const hydration = samplingProseV35Native({ isProviderHydration: true });
            expect(nonHydration.thinkingConfig).toEqual({ thinkingBudget: -1 });
            expect(hydration.thinkingConfig).toEqual({ thinkingBudget: -1 });
        });

        it('prose maxOutputTokens bumped to 8000 (from 4000)', () => {
            expect(samplingProseV35Native({ isProviderHydration: false }).maxOutputTokens).toBe(8000);
            expect(samplingProseV35Native({ isProviderHydration: true }).maxOutputTokens).toBe(8000);
        });

        it('prose temperature is slightly HIGHER than v2.5 (candidate variety in Stage B)', () => {
            const v25NonHydration = getProseSamplingParams(
                { variant: 'v2.5' },
                { isProviderHydration: false },
            );
            const nativeNonHydration = samplingProseV35Native({ isProviderHydration: false });
            expect(nativeNonHydration.temperature).toBeGreaterThan(v25NonHydration.temperature);
            expect(nativeNonHydration.temperature).toBe(0.40);

            const v25Hydration = getProseSamplingParams(
                { variant: 'v2.5' },
                { isProviderHydration: true },
            );
            const nativeHydration = samplingProseV35Native({ isProviderHydration: true });
            expect(nativeHydration.temperature).toBeGreaterThan(v25Hydration.temperature);
            expect(nativeHydration.temperature).toBe(0.25);
        });

        it('reasoning + critique unchanged from v2.5 (not on the 3.5_native critical path)', () => {
            expect(SAMPLING_REASONING_V35_NATIVE).toEqual(getReasoningSamplingParams({ variant: 'v2.5' }));
            expect(SAMPLING_CRITIQUE_V35_NATIVE).toEqual(getCritiqueSamplingParams({ variant: 'v2.5' }));
        });
    });
});

// ───────────────────────────────────────────────────────────────────────────
// Resolver wiring — confirm v2.5-polished and v3.5-native are reachable
// via the resolver getters (not just via direct imports).
// ───────────────────────────────────────────────────────────────────────────

describe('Resolver wiring — v2.5-polished + v3.5-native through getters', () => {
    it('resolveVariant accepts v2.5-polished override', () => {
        expect(resolveVariant({ override: 'v2.5-polished' })).toBe('v2.5-polished');
    });

    it('resolveVariant accepts v3.5-native override', () => {
        expect(resolveVariant({ override: 'v3.5-native' })).toBe('v3.5-native');
    });

    it('v2.5-polished is NOT auto-selected by model name (opt-in only)', () => {
        // Model name only chooses between v2.5 and v3.5 — never the experimental
        // variants. They require explicit override or env.
        expect(resolveVariant({ model: 'gemini-2.5-flash' })).toBe('v2.5');
        expect(resolveVariant({ model: 'gemini-3.5-flash' })).toBe('v3.5');
    });

    it('DIAGNOSIS_PROMPT_VARIANT=v2.5-polished is honoured', () => {
        const ORIGINAL_ENV = { ...process.env };
        process.env.DIAGNOSIS_PROMPT_VARIANT = 'v2.5-polished';
        try {
            expect(resolveVariant()).toBe('v2.5-polished');
        } finally {
            process.env = ORIGINAL_ENV;
        }
    });

    it('DIAGNOSIS_PROMPT_VARIANT=v3.5-native is honoured', () => {
        const ORIGINAL_ENV = { ...process.env };
        process.env.DIAGNOSIS_PROMPT_VARIANT = 'v3.5-native';
        try {
            expect(resolveVariant()).toBe('v3.5-native');
        } finally {
            process.env = ORIGINAL_ENV;
        }
    });

    it('getClassificationSystemPrompt routes v2.5-polished correctly', () => {
        const fromResolver = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, {
            variant: 'v2.5-polished',
        });
        const fromDirect = buildClassificationSystemPrompt_v25_polished(SAMPLE_SERVICE_LIST);
        expect(fromResolver).toBe(fromDirect);
    });

    it('getClassificationSystemPrompt routes v3.5-native correctly', () => {
        const fromResolver = getClassificationSystemPrompt(SAMPLE_SERVICE_LIST, {
            variant: 'v3.5-native',
        });
        const fromDirect = buildClassificationSystemPrompt_v35_native(SAMPLE_SERVICE_LIST);
        expect(fromResolver).toBe(fromDirect);
    });

    it('getProseSystemPrompt routes v2.5-polished correctly', () => {
        const fromResolver = getProseSystemPrompt(FALLBACK_CLASSIFICATION, 'BASE', {
            variant: 'v2.5-polished',
        });
        const fromDirect = buildProseSystemPrompt_v25_polished(FALLBACK_CLASSIFICATION, 'BASE');
        expect(fromResolver).toBe(fromDirect);
    });

    it('getProseSystemPrompt routes v3.5-native correctly', () => {
        const fromResolver = getProseSystemPrompt(FALLBACK_CLASSIFICATION, 'BASE', {
            variant: 'v3.5-native',
        });
        const fromDirect = buildProseSystemPrompt_v35_native(FALLBACK_CLASSIFICATION, 'BASE');
        expect(fromResolver).toBe(fromDirect);
    });

    it('getClassifySamplingParams routes both new variants correctly', () => {
        expect(getClassifySamplingParams({ variant: 'v2.5-polished' })).toEqual(
            SAMPLING_CLASSIFY_V25_POLISHED,
        );
        expect(getClassifySamplingParams({ variant: 'v3.5-native' })).toEqual(
            SAMPLING_CLASSIFY_V35_NATIVE,
        );
    });

    it('getProseSamplingParams routes both new variants correctly', () => {
        for (const isProviderHydration of [true, false]) {
            expect(getProseSamplingParams({ variant: 'v2.5-polished' }, { isProviderHydration })).toEqual(
                samplingProseV25Polished({ isProviderHydration }),
            );
            expect(getProseSamplingParams({ variant: 'v3.5-native' }, { isProviderHydration })).toEqual(
                samplingProseV35Native({ isProviderHydration }),
            );
        }
    });

    it('reasoning sampling delegates polished → v2.5 and native → v3.5', () => {
        // v2.5-polished doesn't diverge on reasoning — same as v2.5
        expect(getReasoningSamplingParams({ variant: 'v2.5-polished' })).toEqual(
            getReasoningSamplingParams({ variant: 'v2.5' }),
        );
        // v3.5-native doesn't diverge on reasoning — same as v3.5 (which itself
        // matches v2.5 today)
        expect(getReasoningSamplingParams({ variant: 'v3.5-native' })).toEqual(
            getReasoningSamplingParams({ variant: 'v3.5' }),
        );
    });

    it('critique sampling delegates polished → v2.5 and native → v3.5', () => {
        expect(getCritiqueSamplingParams({ variant: 'v2.5-polished' })).toEqual(
            getCritiqueSamplingParams({ variant: 'v2.5' }),
        );
        expect(getCritiqueSamplingParams({ variant: 'v3.5-native' })).toEqual(
            getCritiqueSamplingParams({ variant: 'v3.5' }),
        );
    });
});
