# v3.5_native divergence log

One line per change. Newest at the top.

## Format

`YYYY-MM-DD | <builder/param> | <hypothesis> | <eval-score before → after>`

## Entries

2026-05-28 | sampling (prose) | maxOutputTokens 4000 → 8000. The multi-stage protocol expects Stages A-D to surface as narrative in the \`thought\` field. With 4K we risk truncating mid-protocol (already observed on v3.5 iter 1.0 with smaller deltas). 8K gives breathing room. Cost: 2× output tokens on prose. Justified only if the protocol delivers measurable diagnostic accuracy. Eval delta: TBD.

2026-05-28 | sampling (prose) | thinkingBudget: -1 (auto). The whole point of the v3.5_native restructure is letting dynamic thinking execute the 5-stage protocol. With no budget set, 3.5 underuses thinking on harder cases; -1 says "use whatever you need". This is the single most important sampling change. Eval delta: TBD.

2026-05-28 | sampling (prose) | temperature bump 0.35 → 0.40 (non-hydration), 0.22 → 0.25 (hydration). Slight increase to encourage candidate-variety during Stage B (failure-mode enumeration). We want diverse hypotheses, not three paraphrases. Cost: marginal — temperature changes don't directly affect token count. Eval delta: TBD.

2026-05-28 | sampling (classify) | thinkingBudget: 1024 → -1 (auto). v3.5 capped at 1024 defensively after the iter 3 vision-grounding fix. v3.5_native trusts dynamic thinking — 3.5 will use less on easy cases (cost saving) and more on hard cases (quality lift). Eval delta: TBD.

2026-05-28 | prose-system-prompt | STRUCTURAL REWRITE — replaces v2.5's 12-block "do all of this in one shot" with a 5-stage protocol (Stage A equipment identification → Stage B failure-mode enumeration → Stage C adjudication → Stage D self-correction → Stage E output formatting). Plays to 3.5's strengths: dynamic thinking, agentic planning, native self-correction. The schema is UNCHANGED — protocol stages map onto existing fields (Stage A→thought opening + image_descriptions, Stage B→thought middle + structured_clarification when applicable, Stage C→diagnosis title, Stage D→final confidence/clarification). This is the biggest single divergence from v3.5; eval results will decide whether it's worth keeping. Eval delta: TBD.

2026-05-28 | prose-system-prompt | British English throughout (analyse, kerb, no em-dashes). Banned filler-phrase list embedded. Per-field sentence budgets. Diagnosis title cap at 6 words (same as v2.5_polished). Eval delta: TBD.

2026-05-28 | prose-system-prompt | Cause-hierarchy + symmetry-enumeration checks PRESERVED but folded into Stage B rather than as standalone rule blocks. Hypothesis: integrating them into the protocol flow makes them harder to skip than the v2.5 framing where they're separate sections the model can scan past. Eval delta: TBD.

2026-05-28 | classification-system-prompt | Removed explicit confidence-band copy (90-100, 85-94, etc.). Dynamic thinking should calibrate; pre-specified bands constrain it. Replaced with a one-paragraph instruction asking for an honest evidence-grounded number. Eval delta: TBD.

2026-05-28 | classification-system-prompt | Added "use your full thinking budget on hard cases — do not rush" explicit instruction. We're paying for thinking compute; ask for it. v3.5 iter 1.1 didn't include this. Eval delta: TBD.

2026-05-28 | classification-system-prompt | Tighter than v3.5 iter 1.1 — same intent (commit rule, equipment-vs-failure framing, lower clarify threshold) expressed in shorter form. 3.5 with thinking doesn't need as much rules-text. Eval delta: TBD.

## Hypotheses for measurable impact

If the protocol restructure works, we expect:
- Diagnostic accuracy on hard/ambiguous cases: +10-15% over v3.5 (multi-stage adjudication beats single-shot)
- Confidence calibration: 3.5 commits at 88-95 instead of 75-85 on partial evidence (self-correction step explicitly addresses under-confidence)
- Title specificity: better (the multi-stage process forces explicit failure-mode naming in Stage C)
- Token cost: +20-30% on prose (longer thought field, dynamic thinking)
- Latency: +5-10s per call (deeper thinking, more output)

If the protocol DOESN'T work, expected failure modes:
- 3.5 might ignore the stage structure and just emit a single-shot diagnosis (the protocol is advisory; the schema doesn't enforce stages).
- The longer output budget might invite verbose drift (mitigated by concision block).
- Dynamic thinking might cost more than the quality lift justifies on easy cases.

## What we explicitly did NOT do here

- Add new schema fields (failure_candidates[], adjudication_notes, etc.). The dual-model plan Part 2 (c) mentions this; we chose to map stages into the EXISTING schema instead. New schema fields would force type changes downstream that are out of scope for "draft a prompt variant".
- Split into 4 separate Gemini calls. The plan offers this as option (b); we picked option (c) — one call with the protocol as a structural instruction.
- Touch agent-reasoning or agent-critique. Those agents continue to run on v2.5 even when the primary diagnostic path is v3.5_native.

(v3.5_native baseline before these entries: forked structurally from v3.5 on 2026-05-28.)
