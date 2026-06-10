/**
 * v2.5_polished prose system prompt (Agent 2b).
 *
 * Targeted polish over v2.5 prose. The structural blocks (symmetry, cause
 * hierarchy, structured clarification, user-cause / user-named-equipment
 * rules) are kept intact — those are load-bearing for the diagnostic quality
 * wins of the last 2 months. This variant ONLY adds:
 *
 *   1. CONCISION rules. Google explicitly calls out "very verbose" as 2.5's
 *      known weakness; tighter sentence-budget rules per field should reduce
 *      output length ~15-20% with no quality loss.
 *
 *   2. Image-description distinctness reinforcement. The existing rule says
 *      entries must be "visually distinct" — we add good-vs-bad examples to
 *      give the model a concrete shape to copy.
 *
 *   3. Title brevity cap. Currently no max — we get 7-word titles like
 *      "Missing Garage Door Counterbalance Tension Spring". Capping at 6
 *      words forces "Missing Counterbalance Tension Spring" — punchier,
 *      reads better in the report header.
 *
 * Implementation note: we wrap the v2.5 builder and APPEND a polish block,
 * rather than rewriting. This keeps the 2-month tuning intact and limits
 * regression surface — anything that worked before still gets the same
 * baseline instructions, plus this layer of polish on top.
 *
 * IMPORTANT: this is NOT wired into the resolver yet.
 */

import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import { buildProseSystemPrompt as buildProseSystemPrompt_v25 } from '@/features/diagnosis/agent-prose';

const POLISH_BLOCK = `CONCISION RULES (mandatory — applied to every prose field):

Each prose field is allotted a sentence budget. Stay within it.
- diagnosis: max 6 WORDS. The diagnosis field is a HEADLINE, not a sentence. "Missing Counterbalance Tension Spring" (4 words) is correct. "Missing Garage Door Counterbalance Tension Spring" (7 words) is too long — the equipment is already known from the classification. Pure noun phrase, no verbs, no articles.
- message: 1–3 sentences. Warm, direct, no preamble.
- thought: 3–6 sentences. Lead with the diagnostic conclusion, then the evidence chain. No "let me think about this" or "looking at the photos" preamble.
- action_required: 1–2 sentences. Imperative phrasing. "Replace the failed PRV." NOT "It is worth noting that you will need to consider replacing the PRV at your earliest convenience."
- contractor_checklist / homeowner_prep: each bullet ≤ 12 words, imperative phrasing.
- image_descriptions (per entry): 1 sentence per image. No repetition across entries.
- diy_verification: 1 sentence. Concrete check the homeowner can perform with no tools.
- photo_request: 1 sentence OR empty string when no additional photo would help.
- confidence_drivers (per entry): 1 sentence.

BANNED PHRASING (cut whenever it appears — these add length without value):
- "as you may have noticed"
- "it is worth noting that"
- "please be aware that"
- "for your information"
- "I would like to draw your attention to"
- "in this particular case"
- "it appears to be the case that"
- "it should be observed that"
- "as can be seen in the image"
- "upon careful inspection"

Prefer the verb. "The PRV is leaking" beats "It can be observed that the PRV appears to be leaking."

IMAGE_DESCRIPTIONS DISTINCTNESS — concrete examples:

GOOD (each entry names a feature unique to that image):
  [1] "Front face of the geyser — rust ring around the lower mounting strap, drip tray below half-full."
  [2] "Side profile — PRV outlet on right shows green corrosion staining the brass fitting."
  [3] "Underneath shot — pooled water beneath the drain valve, two darker drip-trail lines on the wall."

BAD (entries repeat the same observation, or could swap order without losing meaning):
  [1] "The geyser is rusty and leaking."
  [2] "The geyser shows signs of rust and water damage."
  [3] "There is evidence of rust and a leak on the geyser."

If two photos show the same equipment from different angles, the entries STILL differ — name the side, the close-up detail, or the component visible only in this frame. "Same equipment as image N, no additional visible faults" is acceptable when the additional photo genuinely adds no new evidence. Copy-pasting the previous entry is a diagnostic failure.

TITLE FORMAT REMINDER:
- 1-6 words.
- Headline-style: Title Case, no trailing punctuation, no sentence verbs.
- Names the failed component or named upstream cause (per USER-IDENTIFIED CAUSE rules above).
- Never starts with "Possible", "Likely", "Suspected" — commit or use the (uncertain) suffix mechanism handled by the post-processor.`;

export function buildProseSystemPrompt_v25_polished(
    classification: ClassificationResult,
    baseSystemInstruction: string,
): string {
    const base = buildProseSystemPrompt_v25(classification, baseSystemInstruction);
    // Append the polish block. Keeping the polish at the END means the model
    // sees all the structural rules first (symmetry, cause hierarchy, etc.)
    // and the concision rules apply on top of the existing instructions.
    return `${base}

${POLISH_BLOCK}`;
}
