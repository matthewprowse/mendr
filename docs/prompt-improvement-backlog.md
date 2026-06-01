# Prompt improvement backlog

Items the background sub-agents pick from each night. The orchestrator
(`scripts/eval-overnight.ts`) selects the smallest-difficulty `pending` item
for the requested track, applies the change on a fresh branch, runs the smoke
matrix, and either keeps the branch (status → `landed`) or discards
(status → `regressed`).

## Format

Each item is a `### <stable-id>` heading followed by labelled bullets. The
parser is keyed on the labels, so do not rename them. Edit `Status` to retire
or re-queue items.

- **Track**: `A` (2.5 polisher) | `B` (3.5 architect) | `C` (hybrid builder)
- **Description**: one-line summary
- **Files**: expected files the agent will edit
- **Target metric**: what eval-matrix output should change (and by how much)
- **Difficulty**: `S` (small, < 30 min) | `M` (medium, < 2 h) | `L` (large, multi-iteration)
- **Status**: `pending` | `in-progress` | `landed` | `regressed`

---

## Track A — 2.5 Polisher backlog

### a-prose-tighten-verbosity

- Track: A
- Description: Tighten verbose prose in v2_5_polished — strip 4-6 sentence messages down to 2-3.
- Files: `src/features/diagnosis/prompts/variants/v2_5_polished/*`
- Target metric: completion-token mean -15% across all 4 tests; routing accuracy unchanged.
- Difficulty: S
- Status: pending

### a-confidence-partial-evidence

- Track: A
- Description: Recalibrate confidence bands so "geyser leaking + 3 photos" lands ≥80 instead of 60-65.
- Files: `src/features/diagnosis/prompts/variants/v2_5_polished/*` (classify confidence rubric)
- Target metric: mean confidence on `geyser-full-cues` up from 98 → hold ≥95 with sharper distribution on partial-evidence variants.
- Difficulty: S
- Status: pending

### a-image-description-distinctness

- Track: A
- Description: Add explicit per-image examples that force visually-distinct observations across image_descriptions[].
- Files: `src/features/diagnosis/prompts/variants/v2_5_polished/*` (prose builder)
- Target metric: 0 duplicated text strings across `image_descriptions[]` on a 12-run sweep.
- Difficulty: S
- Status: pending

### a-title-brevity-cap

- Track: A
- Description: Hard-cap title generation at 6 words; reword "Possible Corroded Geyser Cylinder Showing Drip-Tray Brown Water" style.
- Files: `src/features/diagnosis/prompts/variants/v2_5_polished/*` (prose builder)
- Target metric: title word-count P95 ≤ 6 across the 4 tests.
- Difficulty: S
- Status: pending

### a-multi-fault-flag

- Track: A
- Description: When two distinct issues are visible, surface the secondary in `image_descriptions` rather than dropping it. Add an explicit "if two faults, name the secondary" instruction.
- Files: `src/features/diagnosis/prompts/variants/v2_5_polished/*` (prose builder)
- Target metric: on hand-curated multi-fault fixture (TBD), secondary fault mentioned in ≥80% of runs.
- Difficulty: M
- Status: pending

---

## Track B — 3.5 Architect backlog

### b-multi-step-protocol-stages-a-to-e

- Track: B
- Description: Implement multi-step Stage A→E protocol from `2026-05-27-dual-model-optimization.md` Part 2 as the v3_5_native prose architecture. Schema-driven (variant c): equipment_id, failure_candidates[], adjudication_notes, final_diagnosis.
- Files: `src/features/diagnosis/prompts/variants/v3_5_native/*`, `src/features/diagnosis/agent-prose.ts` (schema only)
- Target metric: Cell D score ≥ Cell A; mean confidence on hard cases ≥ 85 with stable commit rate.
- Difficulty: L
- Status: pending

### b-dynamic-thinking-budget-prose

- Track: B
- Description: Switch v3.5 prose `thinkingBudget` from 1024 → -1 (auto). Let 3.5 allocate its own compute on hard cases.
- Files: `src/features/diagnosis/prompts/variants/v3_5_native/*` (sampling params), `agent-prose.ts` (if param is read there)
- Target metric: Cell D mean confidence +5pp on `garage-no-text` without latency blowing past 25s P95.
- Difficulty: S
- Status: pending

### b-self-correction-stage-d

- Track: B
- Description: Add Stage D ("Reconsider: any evidence you under-weighted?") as a discrete schema field; surface revision_notes in the final output for visibility.
- Files: `src/features/diagnosis/prompts/variants/v3_5_native/*`, schema in `agent-prose.ts`
- Target metric: ≥10% of `garage-no-text` runs include a non-empty `revision_notes` field.
- Difficulty: M
- Status: pending

### b-larger-output-budget

- Track: B
- Description: Explore raising prose `maxOutputTokens` 4K → 8K, then → 16K; measure quality vs cost at each step.
- Files: `src/features/diagnosis/prompts/variants/v3_5_native/*` sampling params
- Target metric: incremental output-token spend ≤ +30%; Cell D score holds or improves.
- Difficulty: S
- Status: pending

### b-thought-preservation-refine

- Track: B
- Description: On the refine path (Agent 2c clarify-answer round), use 3.5's thought-preservation so the diagnostic chain isn't re-derived from scratch.
- Files: `src/features/diagnosis/agent-classify.ts` or refine entrypoint, plus v3_5_native prompts
- Target metric: refine call latency -20% and same-or-better final diagnosis on clarify-flow fixtures.
- Difficulty: L
- Status: pending

---

## Track C — Hybrid Builder backlog

### c-add-hard-case-flag-to-classification

- Track: C
- Description: Extend `ClassificationResult` schema with `hard_case_flag: boolean`. Stage-1 sets it true when multi-fault evidence, asymmetry, taxonomy near-miss, or text↔image contradiction is detected.
- Files: `src/features/diagnosis/types.ts`, `src/features/diagnosis/agent-classify.ts`, classify prompt builders.
- Target metric: hard_case_flag fires on ≥80% of fixtures hand-labelled "hard"; ≤10% false-positive on clean fixtures.
- Difficulty: M
- Status: pending

### c-router-in-pipeline-runner

- Track: C
- Description: Build the deterministic router in `pipeline-runner.ts` (or equivalent): branch on `hard_case_flag` AND confidence band to choose 2.5-template path vs 3.5-deep path vs clarify.
- Files: `src/features/diagnosis/processing-orchestrator.ts` (or pipeline-runner if it exists), routing helper module.
- Target metric: routing decisions logged for every diagnose call; eval matrix in "hybrid mode" matches Part 3 cost projection ±20%.
- Difficulty: L
- Status: pending

### c-template-prose-path-high-confidence

- Track: C
- Description: Stage-2 template-based prose path for high-confidence (≥90) 2.5 commits — fills slots (taxonomy_label, suggested_action, expected_callout_cost) instead of free-form generation.
- Files: new module under `src/features/diagnosis/prose-templates/`, wiring in agent-prose.
- Target metric: template-path runs ≥40% cheaper than the equivalent free-form 2.5 prose call with no routing accuracy loss.
- Difficulty: M
- Status: pending

### c-per-stage-routing-decision-logging

- Track: C
- Description: Add structured `logPipelineStep` entries for every router branch with reason (e.g. `routed:3.5-deep`, `reason:hard_case_flag=true`).
- Files: routing helper, processing-orchestrator.
- Target metric: 100% of diagnose calls produce a `routing_decision` log line on the new path.
- Difficulty: S
- Status: pending

### c-fallback-on-stage-2-failure

- Track: C
- Description: If Stage 2 (3.5 deep) fails, fall back to Stage 1's classification + templated prose. No user-visible degradation.
- Files: processing-orchestrator + router module.
- Target metric: simulated Stage 2 failure produces a complete diagnosis with `degraded=true` flag and no 500.
- Difficulty: M
- Status: pending
