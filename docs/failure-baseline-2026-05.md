# Diagnosis Failure Baseline — 2026-05

**Phase:** 0 (Reproduce & Pin)
**Status:** Locked baseline. Updated only when fixtures are added or current behaviour observably changes.
**Source plan:** [Diagnosis-Architecture-Hardening-Plan.md](./Diagnosis-Architecture-Hardening-Plan.md)

## Purpose

This document records the **current (V1) behaviour** of the diagnosis pipeline against the 8 Phase 0 failure-baseline fixtures, side-by-side with the **expected behaviour** the architectural pivot (Phases 4–7) must deliver.

Every subsequent phase clears its bar by closing the gap on this document. Phase 5/6/7's pass condition is: every row below moves from "fails" to "passes."

## Why these 8

The 8 fixtures are chosen to span the failure modes the plan identifies — single-integer confidence collapse, generic clarification loops, per-case prompt-pattern backfire, hazard-blind force-commit, and image-sufficiency blind spots. Each is paired with a JSON fixture at [`src/__tests__/diagnostic-reasoning/fixtures/p0-*.json`](../src/__tests__/diagnostic-reasoning/fixtures).

How to read this:
- **Description** is the user input (text + image present/absent).
- **Expected (post-Phase 6/7)** is what the architecture must produce.
- **Current (V1)** is what the existing pipeline observably produces — captured by manually replicating each fixture against the production-shaped prompts. Where direct production observation was not possible from a dev workstation, the row is marked **predicted** with the structural reason for the prediction.
- **Why it fails** maps the symptom to the structural bug in the plan's diagnosis (single-integer confidence, prose-embedded examples, no rubric, no hazard rule, no image-sufficiency facet).

## The 8 fixtures

### 1. p0-garage-door-partial-spring

**Description:** Garage door opens partially, can't close, one torsion spring missing. No photo.

| | Expected (post-Phase 6) | Current (V1) |
|---|---|---|
| recommended_action | `commit` | `ask` (then `commit_low_confidence` on round 2) |
| Title | `Broken torsion spring` | `Unclear — More Detail Needed` |
| Trade | Security / Garage Door | Security / Garage Door (correct) |
| Confidence | n/a (facet-based) | ~78 (predicted; observed in the triggering incident) |

**Why it fails today.** Single-integer confidence is conservative when no image is present, even though the verbal description uniquely names the failed component. The prompt's worked examples are all about *visual* ambiguity and user corrections; there is no rubric anchor for "confident from a complete text description alone." Result: confidence floats below 85 → `requires_clarification=true` → doom loop.

### 2. p0-geyser-thermostat-intermittent

**Description:** Intermittent hot water. Blurry photo of the geyser thermostat dial, indicator readable only as "somewhere between 50 and 65".

| | Expected (post-Phase 6) | Current (V1) |
|---|---|---|
| recommended_action | `ask` (specific: clearer dial photo) | `ask` (generic clarification) |
| Discriminator | Targets the dial reading specifically | Generic "tell us more about your hot water" |

**Why it fails today.** Agent 2c's chip generation isn't tied to the dominant uncertainty source (the blurry dial). The current prompt has no instruction to identify and surface the specific dimension that is insufficient — `image_sufficiency='partial'` is the missing signal that would let the model name what part of the photo failed.

### 3. p0-sub-board-tripping-after-rain

**Description:** DB sub-board trips main earth leakage after rain. Multiple circuits (geyser, plugs, lights, pool). No photo.

| | Expected (post-Phase 6) | Current (V1) |
|---|---|---|
| recommended_action | `ask` (specific: which circuit when isolated) | `commit_low_confidence` (predicted) |
| Title | n/a (asks first) | `Electrical fault — sub-board tripping` (generic) |

**Why it fails today.** Without explicit per-facet uncertainty, the single confidence integer floats around the commit threshold. The system either commits to a generic diagnosis (giving the contractor no hypothesis to start from) or asks a generic "tell us more" question. There is no rubric for "multiple plausible circuits, a circuit-isolation question would resolve."

### 4. p0-pool-pump-priming-failure

**Description:** Pool pump runs but won't prime; air bubbles visible in clear lid. Clear photo of pump + basket + lid + suction pipe.

| | Expected (post-Phase 6) | Current (V1) |
|---|---|---|
| recommended_action | `commit` (pump losing prime) | `ask` ("is this a pool pump or a borehole pump?") |
| Title | `Pump losing prime — lid seal or suction-side leak` | Clarification chip set including "pool vs borehole" |

**Why it fails today.** Prompt's per-case "pool vs borehole pump" disambiguation example fires defensively even when the case is unambiguous (clear photo of pool pump + explicit pool-pump description). This is the worked-example bias the plan calls out — the model treats the example as a rule rather than as one possible case. The fix is to move pool/borehole disambiguation out of prose and into `diagnosis-trade-taxonomy.ts` `excludes` (already partly there), and to remove the prose example.

### 5. p0-bathroom-drain-blocked

**Description:** Standing water at shower drain. Plunger ineffective. Clear photo of standing water + grate.

| | Expected (post-Phase 6) | Current (V1) |
|---|---|---|
| recommended_action | `commit` (drain blocked) | `ask` (extra clarification round before showing providers) |
| Title | `Blocked shower drain` | `Blocked drain — More Detail Needed` (predicted) |
| Confidence | n/a (facet-based) | ~78 |

**Why it fails today.** Drain blockage from a single fixture with standing water in a clear photo should score >85 on every facet. The single-integer confidence is being pulled down by an over-cautious "cause is uncertain" factor (the system can't see the depth of the blockage, so it generalises that to "we are uncertain" overall).

### 6. p0-cracked-roof-tile-distant

**Description:** Visible cracked roof tile. Photo from ground level, two storeys below, tile is small in frame.

| | Expected (post-Phase 6) | Current (V1) |
|---|---|---|
| recommended_action | `ask` (specific: closer photo OR ceiling check) | `ask` (generic: "send a clearer photo") |
| Discriminator | Names *what* the closer photo needs to show, OR offers the ceiling-check alternative path | Generic "clearer photo please" |

**Why it fails today.** `image_sufficiency='partial'` is the missing facet — the system has a photo but its resolution at the relevant area is too low. The current prompt has no instruction to articulate *what* dimension of the image is insufficient, only that the image is insufficient.

### 7. p0-geyser-leak-ceiling-stain

**Description:** Brown growing water stain on ceiling below the geyser. Two days progression. User cannot safely access roof. Clear photo of ceiling stain.

| | Expected (post-Phase 6/7) | Current (V1) |
|---|---|---|
| recommended_action | `commit_low_confidence` with hazard escalation | `ask` (loops asking for a clearer photo of the geyser) |
| Urgency framing | "Switch geyser off at DB, call a plumber today" | None |

**Why it fails today.** The system can't recognise "further clarification would yield no actionable signal" and falls back to "ask for a clearer photo" — which the user has explicitly said they cannot safely produce. There is no rubric for hazard escalation: when a leak is actively growing, the right move is to commit at low confidence with urgency. Phase 6 logic alone (chip-can-discriminate → ask) doesn't capture this; Phase 7 prose conditioning must add a hazard-urgency layer.

### 8. p0-light-switch-sparking

**Description:** Visible spark inside a 15-year-old bedroom light switch on every flick. Light still works. No photo (user reluctant to handle the switch).

| | Expected (post-Phase 6/7) | Current (V1) |
|---|---|---|
| recommended_action | `commit` with hazard warning | `ask` (system requests photo) → `commit_low_confidence` (generic Electrical fault) on refusal |
| Hazard framing | "Switch the circuit off at the DB, electrician today" | None |

**Why it fails today.** The prompt has no rule that recognises "no photo" is the *safe* answer for live-electrical hazards. Confidence is conservatively pulled down by absent-image signals despite a fully-specified verbal description naming the component, symptom, and component age. Hazard escalation is silent on both the title and the prose.

## Aggregate failure signature

Across the 8 fixtures, the dominant pattern is:

1. **Single-integer confidence under-credits text-only confident cases.** (Fixtures 1, 5, 8.) The fix is Phase 4 — separate `component_confidence` and `cause_confidence` so a complete verbal description can drive component_confidence ≥ 85 even when `image_sufficiency='absent'`.

2. **Worked examples fire as rules, not cases.** (Fixture 4.) The fix is Phase 5 — remove the prose example, keep the taxonomy `excludes` data.

3. **Generic clarification instead of targeted discriminator.** (Fixtures 2, 3, 6.) The fix is Phase 6 — hypothesis-tree completion logic forces Agent 2c to phrase chips around the specific gap, and the Honest Uncertainty screen (Phase 7) renders the gap to the user.

4. **No hazard escalation rule.** (Fixtures 7, 8.) The fix is Phase 7 — prose conditioning must include a hazard layer that elevates urgency on top of the commit-vs-ask decision.

## Pass criteria for later phases

- **Phase 4 ships:** fixtures 1, 5, 8 stop force-asking on text-only confident cases (component_confidence ≥ 85 drives the new commit path).
- **Phase 5 ships:** fixture 4 stops asking pool-vs-borehole (taxonomy carries the disambiguation, prose example deleted).
- **Phase 6 ships:** fixtures 2, 3, 6 produce targeted discriminators instead of generic clarifications; all 8 fixtures' `recommended_action` matches `expected.recommended_action` (the `it.fails(...)` wrappers in `runner.test.ts` get removed).
- **Phase 7 ships:** fixtures 7, 8 produce hazard-framed responses; no "Unclear — More Detail Needed" titles appear.

## Eval suite linkage

These 8 fixtures live at:
- [src/__tests__/diagnostic-reasoning/fixtures/p0-garage-door-partial-spring.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-garage-door-partial-spring.json)
- [src/__tests__/diagnostic-reasoning/fixtures/p0-geyser-thermostat-intermittent.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-geyser-thermostat-intermittent.json)
- [src/__tests__/diagnostic-reasoning/fixtures/p0-sub-board-tripping-after-rain.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-sub-board-tripping-after-rain.json)
- [src/__tests__/diagnostic-reasoning/fixtures/p0-pool-pump-priming-failure.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-pool-pump-priming-failure.json)
- [src/__tests__/diagnostic-reasoning/fixtures/p0-bathroom-drain-blocked.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-bathroom-drain-blocked.json)
- [src/__tests__/diagnostic-reasoning/fixtures/p0-cracked-roof-tile-distant.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-cracked-roof-tile-distant.json)
- [src/__tests__/diagnostic-reasoning/fixtures/p0-geyser-leak-ceiling-stain.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-geyser-leak-ceiling-stain.json)
- [src/__tests__/diagnostic-reasoning/fixtures/p0-light-switch-sparking.json](../src/__tests__/diagnostic-reasoning/fixtures/p0-light-switch-sparking.json)

They are wired into [src/__tests__/diagnostic-reasoning/runner.test.ts](../src/__tests__/diagnostic-reasoning/runner.test.ts) under the `Phase 0 — failure baseline (expected-to-fail until Phase 6)` describe block. The recommended-action assertion uses `computeRecommendedActionStub` (returns `'unknown'`) wrapped in `it.fails(...)` so CI stays green until Phase 6 replaces the stub with the real `computeRecommendedAction`.
