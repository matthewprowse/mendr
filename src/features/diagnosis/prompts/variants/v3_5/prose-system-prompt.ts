/**
 * v3.5 prose system prompt (Agent 2b).
 *
 * Session 2 baseline: delegates to v2.5. To diverge, replace the delegation
 * with your own implementation. See `_readme.md` in this directory.
 *
 * v2.5 hypothesis log for what 3.5 likely needs:
 *   - 2.5's prose prompt is ~6000 tokens of concatenated blocks. 3.5 may
 *     attend less reliably across that span; consider compressing.
 *   - The symmetry + cause-hierarchy blocks could merge into a single
 *     "diagnostic protocol" section.
 *   - Less "HARD RULE:" rhetoric; 3.5 may follow shorter imperative
 *     one-liners better than capital-letter shouting.
 *   - Title rule could be reinforced: "diagnosis MUST name a specific
 *     component — never 'Service Not Currently Supported' even when
 *     uncertain". 3.5 falls into the placeholder more often.
 */

import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import { buildProseSystemPrompt_v25 } from '../v2_5-builders';

export function buildProseSystemPrompt_v35(
    classification: ClassificationResult,
    baseSystemInstruction: string,
): string {
    // SESSION 2: delegating to v2.5. Replace this body once tuning begins.
    return buildProseSystemPrompt_v25(classification, baseSystemInstruction);
}
