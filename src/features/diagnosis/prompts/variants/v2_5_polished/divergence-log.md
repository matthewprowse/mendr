# v2.5_polished divergence log

One line per change to a v2.5_polished builder. Newest at the top.

## Format

`YYYY-MM-DD | <builder> | <hypothesis> | <eval-score before → after>`

## Entries

2026-05-28 | sampling (prose) | Trim temperature by 0.05 (0.35→0.30 non-hydration, 0.22→0.20 hydration). Hypothesis: tighter sampling pairs with the new concision rules — at higher temperature the banned filler phrases (#"as you may have noticed", "it is worth noting") creep back in via paraphrase. Cost: minor reduction in diagnostic creativity on edge cases. Eval delta: TBD.

2026-05-28 | prose-system-prompt | Add CONCISION RULES block appended to the v2.5 builder output. Targets Google's "very verbose" weakness. Per-field sentence budgets, banned-phrase list, prefer-the-verb rule. Expected: ~15-20% output-token reduction on prose, tighter UX. Eval delta: TBD.

2026-05-28 | prose-system-prompt | Title brevity cap (1-6 words). Currently no cap → "Missing Garage Door Counterbalance Tension Spring" (7 words). Capping forces "Missing Counterbalance Tension Spring" (4 words). Equipment context already locked in from classification, so the title doesn't need to repeat it. Expected: punchier headlines, no diagnostic information loss. Eval delta: TBD.

2026-05-28 | prose-system-prompt | Image-description distinctness with concrete GOOD/BAD examples. The existing "must be visually distinct" rule is occasionally ignored. Adding two-line examples gives the model a shape to copy. Expected: fewer copy-paste image_description regressions. Eval delta: TBD.

2026-05-28 | classification-system-prompt | Equipment-vs-failure confidence split. Borrowed structural framing from v3.5 iter 1.1 (proven effective on Cell D). Production v2.5 invites the model to lower confidence whenever the SPECIFIC failure is uncertain, even when EQUIPMENT identification is unambiguous → e.g. rich-evidence geyser photos return 65 instead of 88-92. Expected: confidence on partial-evidence-rich-evidence cases lifts to 85-92. Length impact: ≤+10% of v2.5 (within budget). Eval delta: TBD.

2026-05-28 | classification-system-prompt | One worked example for the partial-evidence / confident-routing pattern. NOT three (v3.5 iter 1.0 lesson — bloat hurts). Single dense example showing geyser photo → confidence 88-92 not 65. Expected: directly improves calibration on the dominant miscalibration pattern.

## Hypotheses we explicitly did NOT pursue here

- Multi-fault detection (would need a new agent or schema field — out of scope for "polish").
- Caching refactor (splitting prose system prompt into static + dynamic blocks). Cost-only win; structural refactor; needs its own session.
- Verbose-prose mitigation in the CLASSIFIER. The classifier doesn't emit prose; this is purely a prose-prompt concern. Noted for clarity.

## Polish philosophy

This variant is intentionally conservative. We KEEP everything that works in v2.5 (symmetry, cause hierarchy, user-cause rules, structured clarification, image observations, schema adherence) and only ADD targeted polish. The expectation is small-medium gains on output quality at no routing regression — verified via the byte-identity-class regression tests.

(v2.5_polished baseline before these entries: forked from production v2.5 on 2026-05-28.)
