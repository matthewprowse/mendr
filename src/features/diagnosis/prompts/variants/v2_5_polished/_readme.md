# v2.5_polished prompt variant

This directory holds polish-only refinements over the production **v2.5**
prompts. Target model: **gemini-2.5-flash**. This is the "wring the last 20%
out of 2.5" variant from the dual-model optimisation plan
(`docs/plans/2026-05-27-dual-model-optimization.md`, Part 1).

## Status (Track B, Session 1)

Draft only. **Not wired into the resolver.** The user reviews the diff and
divergence log, then wires it manually after deciding it's worth comparing
against the v2.5 baseline.

## Polish vs redesign

This is a **polish variant** — incremental refinements over the production
v2.5 prompts. Specifically:

- **Classifier:** equipment-vs-failure confidence split + one worked example
  for the partial-evidence-rich-routing case. Borrowed framing from v3.5
  iter 1.1 (proven effective). Length: ≤+10% of v2.5.

- **Prose:** wraps the v2.5 builder and appends a CONCISION block. Per-field
  sentence budgets, banned-phrase list, title brevity cap (1-6 words),
  image-description distinctness examples. All existing structural blocks
  (symmetry, cause hierarchy, structured clarification, user-cause rule,
  user-named equipment rule, failure-mode catalog, visual anchoring) are
  PRESERVED untouched.

- **Sampling:** prose temperature trimmed 0.35→0.30 / 0.22→0.20 to pair with
  the concision rules. Classify / reasoning / critique unchanged.

- **Reasoning / critique prompts:** unchanged from v2.5. No divergence
  hypothesis for those agents in this iteration.

## How to compare against v2.5

Once wired (manual step):

1. Set `DIAGNOSIS_PROMPT_VARIANT=v2.5_polished` (alongside the existing v2.5
   baseline) and re-run the eval matrix.
2. Compare per-field output:
   - diagnosis title word-count distribution (polished should skew shorter)
   - message + thought sentence-count distribution (polished should skew shorter)
   - image_descriptions distinctness (manual review — polished should have
     fewer near-duplicate entries)
3. Compare routing — should be UNCHANGED on existing 4 tests. Any routing
   regression is a polish failure.

## What's hypothesised to move

| Metric | Direction | Confidence | Source |
|--------|-----------|------------|--------|
| Output token count (prose) | -15 to -20% | medium | Google calls 2.5 "very verbose"; concision rules + banned-phrase list typically deliver this |
| Diagnosis title length | 6-7 words → 3-5 words | high | direct cap |
| Confidence on partial-failure / rich-equipment cases | 65 → 88-92 | medium | borrowed pattern from v3.5 iter 1.1 |
| Routing accuracy on 4-test eval | unchanged | high | no structural classifier changes |
| Image-description distinctness | minor improvement | low-medium | depends on whether model attends to the new examples |

## Files in this directory

- `classification-system-prompt.ts` — diverged from v2.5 (confidence split + worked example)
- `prose-system-prompt.ts` — wraps v2.5 builder + appends CONCISION block
- `sampling-params.ts` — small prose-temp tweak; rest identical to v2.5
- `divergence-log.md` — one line per change; rationale + eval-delta target
- `_readme.md` — this file

## Source of truth

The v2.5 baseline files in `agent-classify.ts` / `agent-prose.ts` are still
the source of truth for v2.5 behaviour. v2.5_polished IMPORTS the v2.5
builder and appends; the classifier is the exception (it diverges enough to
warrant its own copy, but kept compact).

## Anti-pattern to avoid

Do NOT pile more rules onto this variant indefinitely. Polish is bounded —
once the divergence log has 8+ entries, the right move is to either
graduate it to a numbered v2.6 or fork a new polish-iteration directory.
