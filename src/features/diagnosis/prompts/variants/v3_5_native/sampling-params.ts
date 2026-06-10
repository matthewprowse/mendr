/**
 * v3.5_native sampling params.
 *
 * This is where the BIG behavioural changes live. The prompt restructure
 * (multi-stage protocol) only matters if 3.5 Flash is given the compute
 * and the output budget to actually execute it.
 *
 * Divergences from v3.5:
 *
 *   1. CLASSIFY thinkingBudget: 1024 → -1 (auto). Let 3.5 decide how much
 *      thinking it needs per-case. On easy cases this uses LESS than 1024;
 *      on hard cases it uses MORE. v3.5 capped at 1024 which was a defensive
 *      choice — v3.5_native trusts dynamic thinking.
 *
 *   2. PROSE thinkingBudget: not set → -1 (auto). The multi-stage protocol
 *      needs real thinking compute to execute. With no budget set, 3.5
 *      may underuse it; -1 says "use whatever you need".
 *
 *   3. PROSE maxOutputTokens: 4000 → 8000. The multi-stage protocol pushes
 *      a much longer thought field (covering Stages A-D as narrative). 4K
 *      was tight even for v2.5-style single-shot prose; 8K gives the protocol
 *      room to breathe. Cost: 2× output tokens on prose. The hypothesis is
 *      that 3.5's thinking actually delivers a measurably better diagnosis,
 *      justifying the additional spend on the cases that need it.
 *
 *   4. PROSE temperature: 0.35 → 0.40 (non-hydration), 0.22 → 0.25 (hydration).
 *      Slightly UP. The multi-stage protocol benefits from a touch more
 *      variety during Stage B (failure-mode enumeration) — we want diverse
 *      candidates, not three paraphrases of the same hypothesis.
 *
 *   5. CLASSIFY maxOutputTokens: 2000 (unchanged from v3.5). The classifier
 *      output is small and the v3.5 bump from 520→2000 already accounts for
 *      thinking-token overhead.
 *
 * Reasoning + critique unchanged from v2.5 — those agents don't run on the
 * primary 3.5_native diagnostic path in this draft. (If we ever wire them
 * to 3.5 too, revisit.)
 *
 * IMPORTANT: NOT wired through the resolver yet.
 */

import type { SamplingParams } from '@/features/diagnosis/prompts/variants/prompt-variant';

/**
 * Classify sampling params for v3.5_native.
 *
 * IMPORTANT (cost-cut Deliverable 1): the v3.5-native classifier now runs on
 * gemini-2.0-flash-lite (mixed-tier classifier — Lite for classify, 3.5 for
 * prose). The model swap happens in `agent-classify.ts` when variant ===
 * 'v3.5-native'. Sampling here is tuned for 2.0 Flash Lite:
 *   - Lite does NOT have hidden thinking-budget burn, so the
 *     maxOutputTokens=2000 head-room from 3.5 is unnecessary; trimmed to 1500.
 *   - `thinkingConfig` removed entirely — 2.0 Flash Lite does not support it
 *     and including the field can cause the SDK to error or silently downgrade
 *     to no-think (which is what we want anyway).
 *
 * Temperature/topK/topP unchanged: classification is a near-deterministic JSON
 * task and the cheaper Lite model handled it correctly with these values in
 * the earlier eval matrix.
 */
export const SAMPLING_CLASSIFY_V35_NATIVE: SamplingParams = {
    temperature: 0.1,
    topK: 10,
    topP: 0.6,
    maxOutputTokens: 1500,
};

/**
 * Prose sampling params for v3.5_native. Larger output budget (8K, up from
 * 4K) to accommodate the multi-stage protocol's longer thought field. Slight
 * temperature bump to encourage candidate-variety during failure-mode
 * enumeration (Stage B).
 *
 * thinkingBudget = -1 lets the model use as much thinking as it needs to
 * execute the 5-stage protocol. Cost: highest of any variant. Justified
 * only if the protocol delivers measurable diagnostic accuracy gains.
 */
export function samplingProseV35Native(opts: { isProviderHydration: boolean }): SamplingParams {
    return {
        temperature: opts.isProviderHydration ? 0.25 : 0.40,
        topP: 0.85,
        topK: 40,
        maxOutputTokens: 8000,
        thinkingConfig: { thinkingBudget: -1 },
    };
}

/**
 * Reasoning sampling params for v3.5_native. Unchanged from v2.5 — Agent 2c
 * is not on the 3.5_native critical path in this draft.
 */
export const SAMPLING_REASONING_V35_NATIVE: SamplingParams = {
    temperature: 0.2,
    topK: 20,
    topP: 0.8,
    maxOutputTokens: 1200,
};

/**
 * Critique sampling params for v3.5_native. Unchanged from v2.5 — Agent 3
 * (critique) continues to run on 2.5 even when the primary diagnostic path
 * is 3.5_native.
 */
export const SAMPLING_CRITIQUE_V35_NATIVE: SamplingParams = {
    temperature: 0.1,
    topK: 20,
    topP: 0.8,
    maxOutputTokens: 1500,
};
