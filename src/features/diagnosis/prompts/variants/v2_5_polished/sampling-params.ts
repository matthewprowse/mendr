/**
 * v2.5_polished sampling params.
 *
 * Optional divergence point. For this iteration we propose ONE small change
 * on the prose side and leave classify alone:
 *
 *   - prose temperature lowered from 0.35 → 0.30 (isProviderHydration=false)
 *     and 0.22 → 0.20 (isProviderHydration=true). Hypothesis: tighter
 *     sampling pairs well with the new concision rules — at higher temp the
 *     banned phrases creep back in via paraphrase. We're consciously trading
 *     a hair of variety for tighter prose. If this dampens diagnostic
 *     creativity on edge cases we revert.
 *
 *   - classify is UNCHANGED from v2.5 (already well-tuned at 13/13 routing).
 *
 *   - reasoning + critique are UNCHANGED from v2.5.
 *
 * These constants are NOT wired through the resolver yet. The user will
 * decide whether to surface them when wiring the variant.
 */

import type { SamplingParams } from '@/features/diagnosis/prompts/variants/prompt-variant';

/**
 * Classify sampling params for v2.5_polished. Currently identical to v2.5 —
 * no divergence yet.
 */
export const SAMPLING_CLASSIFY_V25_POLISHED: SamplingParams = {
    temperature: 0.1,
    topK: 10,
    topP: 0.6,
    maxOutputTokens: 520,
};

/**
 * Prose sampling params for v2.5_polished. Slight temperature reduction
 * (-0.05) to pair with the new concision rules — at higher temperature the
 * banned phrases slip back in via paraphrase.
 */
export function samplingProseV25Polished(opts: { isProviderHydration: boolean }): SamplingParams {
    return {
        temperature: opts.isProviderHydration ? 0.20 : 0.30,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4000,
    };
}

/**
 * Reasoning sampling params for v2.5_polished. Currently identical to v2.5 —
 * no divergence yet.
 */
export const SAMPLING_REASONING_V25_POLISHED: SamplingParams = {
    temperature: 0.2,
    topK: 20,
    topP: 0.8,
    maxOutputTokens: 1200,
};

/**
 * Critique sampling params for v2.5_polished. Currently identical to v2.5 —
 * no divergence yet.
 */
export const SAMPLING_CRITIQUE_V25_POLISHED: SamplingParams = {
    temperature: 0.1,
    topK: 20,
    topP: 0.8,
    maxOutputTokens: 1500,
};
