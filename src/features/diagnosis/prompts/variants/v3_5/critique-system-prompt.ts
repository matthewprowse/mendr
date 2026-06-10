/**
 * v3.5 critique system prompt (Agent 3).
 *
 * Session 2 baseline: delegates to v2.5. To diverge, replace the delegation
 * with your own implementation. See `_readme.md` in this directory.
 *
 * Critique uses its own model env (GEMINI_CRITIQUE_MODEL) and is separately
 * resolvable — you can run the main pipeline on 3.5 with v3.5 prompts while
 * keeping critique on 2.5 with v2.5 prompts. The resolver in
 * `../prompt-variant.ts` reads the critique-specific env.
 *
 * v2.5 hypothesis log for what 3.5 likely needs:
 *   - 2026-05-27 eval showed Agent 3 returning `failure_mode='rubric_miscalibration'`
 *     on most cases. That's a flag that the rubric itself is mis-tuned for
 *     the diagnosis quality 3.5 produces.
 *   - Consider revising the rubric to recognise the 3.5 confidence-band
 *     drift (70-84 returned where 2.5 returns 95-98) as model-side
 *     conservatism rather than diagnostic failure.
 */

import type { DiagnosisOutcome } from '@/features/diagnosis/prompts/critique-system';
import { buildCritiqueSystemPrompt_v25 } from '../v2_5-builders';

export function buildCritiqueSystemPrompt_v35({
    outcome,
    round,
}: {
    outcome: DiagnosisOutcome;
    round: 1 | 2;
}): string {
    // SESSION 2: delegating to v2.5. Replace this body once tuning begins.
    return buildCritiqueSystemPrompt_v25({ outcome, round });
}
