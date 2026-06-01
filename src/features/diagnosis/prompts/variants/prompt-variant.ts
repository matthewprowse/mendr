/**
 * Prompt-variant resolver.
 *
 * The diagnosis pipeline has been iterated for months against gemini-2.5-flash.
 * Switching the model alias to gemini-3.5-flash on its own does NOT carry the
 * prompt tuning over — the two model generations interpret the same prompts
 * differently. This file is the dispatcher that lets us maintain SEPARATE
 * prompt versions per model generation without overwriting either set.
 *
 * Design:
 *   - "v2.5" is the production-tuned baseline. All current prompt-build
 *     functions in agent-classify / agent-prose / agent-reasoning /
 *     agent-critique ARE v2.5 — they are not modified by this layer.
 *   - "v3.5" is a sibling variant that initially delegates to v2.5 (zero
 *     behaviour change). It diverges as we tune the prompts for 3.5 Flash.
 *   - The variant is resolved per request (defaults from model name and
 *     env var), so a single dev server can serve both variants for A/B work.
 *
 * Variant resolution order (first match wins):
 *   1. explicit `override` arg (used by request-level overrides in the API)
 *   2. `DIAGNOSIS_PROMPT_VARIANT` env var ('v2.5' | 'v3.5')
 *   3. inferred from `model` arg or `GEMINI_DIAGNOSIS_MODEL` env (anything
 *      starting with 'gemini-3' → v3.5; everything else → v2.5)
 *
 * IMPORTANT: every `_v35` builder currently re-exports its `_v25` counterpart.
 * That's intentional — Session 2 will diverge them. Until then, runs with
 * variant=v3.5 must produce byte-identical Gemini input to runs with
 * variant=v2.5. A snapshot test enforces this.
 */

import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import {
    buildClassificationSystemPrompt_v25,
    buildProseSystemPrompt_v25,
    buildReasoningSystemPrompt_v25,
    buildCritiqueSystemPrompt_v25,
} from './v2_5-builders';
import { buildClassificationSystemPrompt_v35 } from './v3_5/classification-system-prompt';
import { buildProseSystemPrompt_v35 } from './v3_5/prose-system-prompt';
import { buildReasoningSystemPrompt_v35 } from './v3_5/reasoning-system-prompt';
import { buildCritiqueSystemPrompt_v35 } from './v3_5/critique-system-prompt';
import { buildClassificationSystemPrompt_v25_polished } from './v2_5_polished/classification-system-prompt';
import { buildProseSystemPrompt_v25_polished } from './v2_5_polished/prose-system-prompt';
import {
    SAMPLING_CLASSIFY_V25_POLISHED,
    samplingProseV25Polished,
    SAMPLING_REASONING_V25_POLISHED,
    SAMPLING_CRITIQUE_V25_POLISHED,
} from './v2_5_polished/sampling-params';
import { buildClassificationSystemPrompt_v35_native } from './v3_5_native/classification-system-prompt';
import { buildProseSystemPrompt_v35_native } from './v3_5_native/prose-system-prompt';
import {
    SAMPLING_CLASSIFY_V35_NATIVE,
    samplingProseV35Native,
    SAMPLING_REASONING_V35_NATIVE,
    SAMPLING_CRITIQUE_V35_NATIVE,
} from './v3_5_native/sampling-params';
import type { DiagnosisOutcome } from '@/features/diagnosis/prompts/critique-system';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Prompt variants available in the resolver.
 *
 *   v2.5            — current production baseline (2 months of tuning).
 *   v3.5            — minimal v2.5-style port for 3.5 Flash (sampling fixes + thinkingConfig).
 *   v2.5-polished   — opt-in: v2.5 with targeted concision + confidence-calibration tweaks.
 *                     Reasoning/critique builders still delegate to v2.5 (only classify + prose
 *                     diverge). Auto-selection is OFF — must be set via override or env.
 *   v3.5-native     — opt-in: full multi-step diagnostic protocol playing to 3.5's strengths
 *                     (dynamic thinking, larger output budget). Same delegation pattern as
 *                     v2.5-polished for reasoning/critique. Auto-selection is OFF.
 */
export type PromptVariant = 'v2.5' | 'v3.5' | 'v2.5-polished' | 'v3.5-native';

export interface VariantContext {
    readonly variant: PromptVariant;
}

export interface SamplingParams {
    readonly temperature: number;
    readonly topK: number;
    readonly topP: number;
    readonly maxOutputTokens: number;
    /**
     * Optional Gemini thinkingConfig. When set, the SDK gives the model
     * dedicated reasoning budget BEFORE it emits the structured response.
     * v3.5 uses this on the classifier to help vision grounding ("what
     * equipment is this?") — without it, 3.5 Flash defaults to
     * `subcategory_id="none_unmapped"` even when equipment is clearly visible.
     * Spread into generationConfig at the call site.
     */
    readonly thinkingConfig?: { thinkingBudget: number };
}

// ── Variant resolution ────────────────────────────────────────────────────────

const ALL_VARIANTS: readonly PromptVariant[] = [
    'v2.5',
    'v3.5',
    'v2.5-polished',
    'v3.5-native',
] as const;
function isPromptVariant(s: unknown): s is PromptVariant {
    return typeof s === 'string' && (ALL_VARIANTS as readonly string[]).includes(s);
}

/**
 * Resolve which prompt variant to use for this call.
 *
 * `override` wins outright (used by request-level API overrides for eval).
 * Then `DIAGNOSIS_PROMPT_VARIANT` env. Then inferred from model name.
 *
 * **Auto-selection only chooses between `v2.5` and `v3.5`** — the polished
 * and native variants are opt-in (override or env) only, because they're
 * experimental and we don't want a model-name change to silently swap them
 * into production. To use them: pass `override: 'v2.5-polished'` (or
 * `'v3.5-native'`) or set `DIAGNOSIS_PROMPT_VARIANT` in env.
 *
 * Future-proof default: any unknown model falls back to v2.5. When a
 * `gemini-4-flash` ships, add an explicit branch here rather than relying
 * on the prefix.
 */
export function resolveVariant(opts?: {
    override?: PromptVariant | null;
    model?: string | null;
}): PromptVariant {
    const override = opts?.override;
    if (isPromptVariant(override)) return override;

    const envOverride = process.env.DIAGNOSIS_PROMPT_VARIANT;
    if (isPromptVariant(envOverride)) return envOverride;

    const model =
        opts?.model || process.env.GEMINI_DIAGNOSIS_MODEL || 'gemini-2.5-flash';
    if (typeof model === 'string' && model.startsWith('gemini-3')) return 'v3.5';
    return 'v2.5';
}

// ── Sampling-param tables (extracted verbatim from each agent) ────────────────

// classify — currently in agent-classify.ts line ~425
const SAMPLING_CLASSIFY_V25: SamplingParams = {
    temperature: 0.1,
    topK: 10,
    topP: 0.6,
    maxOutputTokens: 520,
};
// v3.5: bumped from 520 to 2000 after observation in iter 1.1 that 3.5 Flash
// consistently truncates at ~8-10 completionTokens with maxOutputTokens=520.
// The model produces `{ "subcategory_id": "ge` then stops. Hypothesis: 3.5
// burns "thinking tokens" against the maxOutputTokens budget before emitting
// the structured output, so 520 leaves ~10 tokens for actual JSON. The
// prose agent works fine on 3.5 with maxOutputTokens=4000, supporting this
// theory. Cost delta is negligible — the unused budget isn't billed; we
// only pay for what the model actually emits (~150 tokens for a typical
// classification JSON).
const SAMPLING_CLASSIFY_V35: SamplingParams = {
    temperature: 0.1,
    topK: 10,
    topP: 0.6,
    maxOutputTokens: 2000,
    // iter 3 (2026-05-27): explicit reasoning budget for vision grounding.
    // Without this, 3.5 returns valid JSON but with subcategory_id =
    // "none_unmapped" on photos where 2.5 commits to a specific row.
    // Same pattern the prose agent already uses (its generationConfig has
    // thinkingConfig 1024). Cost: extra latency + tokens during reasoning.
    thinkingConfig: { thinkingBudget: 1024 },
};
// reasoning (Agent 2c) — currently in agent-reasoning.ts line ~305
const SAMPLING_REASONING_V25: SamplingParams = {
    temperature: 0.2,
    topK: 20,
    topP: 0.8,
    maxOutputTokens: 1200,
};
// critique (Agent 3) — currently in agent-critique.ts line ~348
const SAMPLING_CRITIQUE_V25: SamplingParams = {
    temperature: 0.1,
    topK: 20,
    topP: 0.8,
    maxOutputTokens: 1500,
};

// prose has a runtime-dependent temperature, so we expose a function rather
// than a constant. Currently in agent-prose.ts line ~1434:
//   temperature: params.isProviderHydration ? 0.22 : 0.35
function samplingProseV25(opts: { isProviderHydration: boolean }): SamplingParams {
    return {
        temperature: opts.isProviderHydration ? 0.22 : 0.35,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4000,
    };
}

// ── Sampling-param getters ────────────────────────────────────────────────────

// Session-1 contract: every v3.5 path delegates to v2.5. Once tuning begins
// in Session 3+, the v3.5 branches replace these with diverged values.

export function getClassifySamplingParams(ctx: VariantContext): SamplingParams {
    switch (ctx.variant) {
        case 'v3.5':           return SAMPLING_CLASSIFY_V35;
        case 'v2.5-polished':  return SAMPLING_CLASSIFY_V25_POLISHED;
        case 'v3.5-native':    return SAMPLING_CLASSIFY_V35_NATIVE;
        case 'v2.5':
        default:               return SAMPLING_CLASSIFY_V25;
    }
}

export function getProseSamplingParams(
    ctx: VariantContext,
    runtime: { isProviderHydration: boolean },
): SamplingParams {
    switch (ctx.variant) {
        case 'v3.5':           return samplingProseV25(runtime); // v3.5 still delegates to v2.5
        case 'v2.5-polished':  return samplingProseV25Polished(runtime);
        case 'v3.5-native':    return samplingProseV35Native(runtime);
        case 'v2.5':
        default:               return samplingProseV25(runtime);
    }
}

export function getReasoningSamplingParams(ctx: VariantContext): SamplingParams {
    switch (ctx.variant) {
        case 'v3.5':           return SAMPLING_REASONING_V25; // delegate
        case 'v2.5-polished':  return SAMPLING_REASONING_V25_POLISHED;
        case 'v3.5-native':    return SAMPLING_REASONING_V35_NATIVE;
        case 'v2.5':
        default:               return SAMPLING_REASONING_V25;
    }
}

export function getCritiqueSamplingParams(ctx: VariantContext): SamplingParams {
    switch (ctx.variant) {
        case 'v3.5':           return SAMPLING_CRITIQUE_V25; // delegate
        case 'v2.5-polished':  return SAMPLING_CRITIQUE_V25_POLISHED;
        case 'v3.5-native':    return SAMPLING_CRITIQUE_V35_NATIVE;
        case 'v2.5':
        default:               return SAMPLING_CRITIQUE_V25;
    }
}

// ── System-prompt getters ─────────────────────────────────────────────────────

export function getClassificationSystemPrompt(
    serviceListText: string,
    ctx: VariantContext,
): string {
    switch (ctx.variant) {
        case 'v3.5':           return buildClassificationSystemPrompt_v35(serviceListText);
        case 'v2.5-polished':  return buildClassificationSystemPrompt_v25_polished(serviceListText);
        case 'v3.5-native':    return buildClassificationSystemPrompt_v35_native(serviceListText);
        case 'v2.5':
        default:               return buildClassificationSystemPrompt_v25(serviceListText);
    }
}

export function getProseSystemPrompt(
    classification: ClassificationResult,
    baseSystemInstruction: string,
    ctx: VariantContext,
): string {
    switch (ctx.variant) {
        case 'v3.5':           return buildProseSystemPrompt_v35(classification, baseSystemInstruction);
        case 'v2.5-polished':  return buildProseSystemPrompt_v25_polished(classification, baseSystemInstruction);
        case 'v3.5-native':    return buildProseSystemPrompt_v35_native(classification, baseSystemInstruction);
        case 'v2.5':
        default:               return buildProseSystemPrompt_v25(classification, baseSystemInstruction);
    }
}

export function getReasoningSystemPrompt(
    round: 1 | 2,
    priorContext: string | undefined,
    ctx: VariantContext,
): string {
    // v2.5-polished and v3.5-native intentionally do not diverge from their
    // bases on the reasoning agent — only classify + prose are tuned. Map
    // them to the matching base.
    switch (ctx.variant) {
        case 'v3.5':           return buildReasoningSystemPrompt_v35(round, priorContext);
        case 'v3.5-native':    return buildReasoningSystemPrompt_v35(round, priorContext);
        case 'v2.5-polished':  return buildReasoningSystemPrompt_v25(round, priorContext);
        case 'v2.5':
        default:               return buildReasoningSystemPrompt_v25(round, priorContext);
    }
}

export function getCritiqueSystemPrompt(
    args: { outcome: DiagnosisOutcome; round: 1 | 2 },
    ctx: VariantContext,
): string {
    // Same delegation pattern as reasoning — polished/native don't diverge.
    switch (ctx.variant) {
        case 'v3.5':           return buildCritiqueSystemPrompt_v35(args);
        case 'v3.5-native':    return buildCritiqueSystemPrompt_v35(args);
        case 'v2.5-polished':  return buildCritiqueSystemPrompt_v25(args);
        case 'v2.5':
        default:               return buildCritiqueSystemPrompt_v25(args);
    }
}
