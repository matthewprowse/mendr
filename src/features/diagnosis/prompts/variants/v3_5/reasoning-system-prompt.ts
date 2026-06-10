/**
 * v3.5 reasoning system prompt (Agent 2c).
 *
 * Session 2 baseline: delegates to v2.5. To diverge, replace the delegation
 * with your own implementation. See `_readme.md` in this directory.
 *
 * v2.5 hypothesis log for what 3.5 likely needs:
 *   - Agent 2c is the rescue source on 3.5 when Agent 2a fails — its
 *     hypotheses currently come out with confidence in the 70-90 range,
 *     mostly correct but with occasional non-committal labels like
 *     "Upstream Support or Counterbalance Failure" (test 4 round A).
 *   - Tighten the "h1.label MUST name a specific named component" rule.
 *   - Calibrate the chip effects more aggressively — currently "confirms"
 *     and "rules_out" don't shift confidence as much as the rubric says.
 */

import { buildReasoningSystemPrompt_v25 } from '../v2_5-builders';

export function buildReasoningSystemPrompt_v35(
    round: 1 | 2,
    priorContext?: string,
): string {
    // SESSION 2: delegating to v2.5. Replace this body once tuning begins.
    return buildReasoningSystemPrompt_v25(round, priorContext);
}
