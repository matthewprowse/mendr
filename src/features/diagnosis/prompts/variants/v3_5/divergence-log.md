# v3.5 divergence log

One line per change to a v3.5 builder. Newest at the top.

## Format

`YYYY-MM-DD | <builder> | <hypothesis> | <eval-score before → after>`

## Entries

2026-05-27 | classification-sampling-params | iter 3: add thinkingConfig.thinkingBudget=1024 to v3.5 classify. **Closes the remaining gap on Cell D's geyser test.** With iter 2 alone, classifier succeeds but emits subcategory_id="none_unmapped" on geyser photos — model can't visually ground without explicit reasoning budget. Smoke result on iter 3: geyser-full-cues went from conf=75/clarify=true (iter 2) to conf=95/clarify=false (iter 3) — matching Cell A behaviour on this case. Same pattern prose already uses; classifier needed it too.
2026-05-27 | classification-sampling-params | iter 2: bump maxOutputTokens 520 → 2000 for v3.5. **+15 pp on Cell D (77% → 92%).** Server logs confirm: before this change, agent-classify on 3.5 Flash had status=error with completionTokens=8 (cut off mid-token at `{ "subcategory_id": "ge`). After: status=ok with completionTokens=205. Lesson learned: 3.5 Flash burns thinking tokens against maxOutputTokens budget before emitting structured output. This is sampling, not prompt — iter 1 prompt tweaks alone never could have fixed this.
2026-05-27 | classification-system-prompt | iter 1.1: same structural intent as 1.0 (commit rule, equipment vs failure conf split, clarify threshold 70) but condensed back to v2.5-comparable length. Tripwire test added (max +15% length) so the verbose version can't sneak back in.
2026-05-27 | classification-system-prompt | iter 1.0 (REVERTED): added 3 worked examples + verbose commit rules. Broke 3.5 Flash — agent-classify status=error, JSON parse failed, completionTokens=10. Prompt was 13682 tokens vs v2.5's 10454 (~30% larger). Lesson: 3.5 needs DENSER instructions, not more verbose ones.

(Session 2 baseline before this entry: byte-identical to v2.5)
