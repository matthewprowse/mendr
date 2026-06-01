# v3.5_native prompt variant

This directory holds prompts STRUCTURALLY REDESIGNED for **gemini-3.5-flash**.
Target model: gemini-3.5-flash. This is the "play to 3.5's actual strengths"
variant from the dual-model optimisation plan
(`docs/plans/2026-05-27-dual-model-optimization.md`, Part 2).

## Status (Track B, Session 1)

Draft only. **Not wired into the resolver.** The user reviews the diff and
the divergence log, then wires it manually after deciding it's worth
comparing against the v3.5 baseline.

## "Native" vs "patch"

- **v3.5** (the existing variant) is a patch on v2.5: tweaked commit rule,
  bumped maxOutputTokens, added thinkingConfig. None of those play to 3.5's
  actual strengths — they're defensive port-and-debug.

- **v3.5_native** (this variant) is structurally different. It frames the
  diagnostic task as a 5-stage protocol that 3.5 EXECUTES as an agent,
  leaning into:
    • dynamic thinking (thinkingBudget=-1, not capped at 1024)
    • agentic multi-step planning
    • native self-correction
    • larger output budget (8K, up from 4K)

## The 5-stage diagnostic protocol

Embedded in the prose system prompt. Stages map onto the EXISTING
DiagnosisData schema (no schema changes for this draft):

| Stage | What it does | Schema home |
|-------|--------------|-------------|
| A — Equipment identification | "What equipment is in the photos? Cite images + visible features." | thought (opening), image_descriptions, image_observations |
| B — Failure-mode enumeration | "List 2-4 plausible failures with evidence_for + evidence_against." | thought (middle), structured_clarification.hypotheses (when applicable), confidence_drivers |
| C — Adjudication | "Pick the most likely failure. Justify by ruling out the alternatives." | diagnosis (title), failed_component, thought (adjudication paragraph) |
| D — Self-correction | "Reconsider: any evidence you under-weighted? Adjust confidence if so." | final confidence, final requires_clarification, thought (closing) |
| E — Output formatting | Render the protocol's findings into all schema fields. | (all remaining schema fields) |

## Sampling changes (the BIG behavioural deltas)

| Param | v3.5 | v3.5_native | Hypothesis |
|-------|------|-------------|------------|
| classify thinkingBudget | 1024 | -1 (auto) | Let dynamic thinking calibrate per-case |
| prose thinkingBudget | (not set) | -1 (auto) | Protocol needs real thinking compute |
| prose maxOutputTokens | 4000 | 8000 | Multi-stage protocol → longer thought field |
| prose temperature (non-hydration) | 0.35 | 0.40 | Encourage candidate-variety in Stage B |
| prose temperature (hydration) | 0.22 | 0.25 | Same |
| prose topP | 0.8 | 0.85 | Marginal — pairs with temperature bump |

Reasoning + critique sampling: UNCHANGED from v2.5. Those agents are not on
the 3.5_native critical diagnostic path in this draft.

## How to compare against v3.5

Once wired (manual step):

1. Set `DIAGNOSIS_PROMPT_VARIANT=v3.5_native` and re-run the eval matrix
   against the same fixtures used for v3.5.
2. Compare per-case:
   - **diagnosis title quality** — does Stage C produce specific failure-mode
     titles more reliably than v3.5's single-shot?
   - **confidence calibration** — does Stage D's self-correction lift
     confidence on rich-evidence partial-failure cases?
   - **structured_clarification quality** — when Stage B / Stage D conclude
     it's a tie, are the 2-3 hypotheses better differentiated than v3.5's?
   - **token cost** — expect +20-30% on prose. Quality lift must justify.
   - **latency** — expect +5-10s per call. Acceptable for non-realtime path.

## What's hypothesised to move

| Metric | Direction | Confidence |
|--------|-----------|------------|
| Diagnostic accuracy on hard cases | +10-15% over v3.5 | medium |
| Confidence calibration (partial-evidence cases) | 75-85 → 88-95 | medium |
| Title specificity | improved | medium-high |
| Token cost (prose) | +20-30% | high |
| Latency per call | +5-10s | high |

## Anti-patterns (things to NOT do when iterating on this variant)

- Don't pile rule blocks on top of the 5-stage protocol. The protocol is the
  structure; rules sit INSIDE stages, not alongside them.
- Don't shrink the output budget back to 4K to save tokens. The whole point
  is room for the protocol to execute.
- Don't add schema fields without checking downstream compatibility (the
  existing DiagnosisData type is tightly coupled to UI rendering).
- Don't port the v3.5_native protocol verbatim into v2.5. 2.5 doesn't have
  the same dynamic-thinking primitive; the protocol leans on something
  2.5 can't fully execute.

## Files in this directory

- `classification-system-prompt.ts` — structurally different from v3.5 (no
  pre-specified confidence bands, explicit "use full thinking" instruction,
  tighter rules-text)
- `prose-system-prompt.ts` — the 5-stage protocol (this is the centrepiece)
- `sampling-params.ts` — dynamic-thinking + 8K prose output + slight temp bump
- `divergence-log.md` — one line per change; rationale + eval-delta target
- `_readme.md` — this file

## Honest caveats

The 5-stage protocol is a hypothesis. 3.5's "execute this protocol" instinct
might land less reliably than hoped — the schema doesn't enforce stages, and
3.5 might just emit a single-shot diagnosis regardless. The eval will
decide. If the protocol delivers no measurable lift, the right next step is
either:
- (b) split into 4 separate Gemini calls (heavier scaffolding, observable
  per-stage), or
- extend the schema with explicit `failure_candidates[]` and
  `adjudication_notes` fields (forces stage adherence).

Both are out of scope for this draft.
