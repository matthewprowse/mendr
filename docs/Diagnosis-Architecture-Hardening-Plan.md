# Diagnosis Architecture Hardening Plan

**Author:** Matthew + Claude · **Status:** Proposed · **Last updated:** 2026-05-26

## The Triggering Incident

A user described a garage door that "opens partially, can't close, spring missing on one side." The system returned:

- **Trade**: Security → Garage Door (high confidence)
- **Diagnosis**: "Unclear — More Detail Needed"
- **Loop**: After providing more detail, the same set of clarification questions returned

The user description is textbook torsion-spring failure. Torsion springs always come in pairs; one absent means both must be replaced. This should be diagnosable at >85% confidence without a photo.

## What This Plan Does Not Do — and the Distinction That Matters

This plan **deliberately does not** add a per-case patch for garage doors. The garage door case is not the problem to fix — it is the case that exposed a class of bug.

But "per-case" needs to be defined carefully, because there is a real and important difference between three kinds of content that today live mixed together in the prompts:

### The three buckets

**Bucket A — Per-case diagnostic patches (forbidden).**
Rules that tune behavior for one specific diagnosis or one specific fault scenario. Examples:
- "For garage doors with a missing spring, boost confidence by +15."
- "If the user mentions 'capacitor,' set component_confidence to at least 85."
- "Treat borehole pump priming failures as commit-able even with no image."

These are bug-for-bug fixes. They do not generalise. They rot the prompt. They are what Principle 1 forbids.

**Bucket B — Trade taxonomy rules (legitimate; belong in data, not prose).**
Domain knowledge about how trades and subcategories are scoped, where their boundaries lie, and which equipment routes to which trade. Examples:
- "A gate motor is Security/gate, not Security/garage door — they sit at different places on a property and move differently."
- "A pool pump and a borehole pump look similar but route to different trades."
- "A full kitchen rebuild is Building & Construction, not General Handyman."

These are not per-case patches. They are the **structural definition of the trade system**, and they must exist somewhere or the model has no map of the world. The bug is not that these rules exist — it's that they live as prose examples in `base.ts` and `output-format.ts` instead of as structured data in the existing `diagnosis-trade-taxonomy.ts` (which already has `scope`, `excludes`, and `inferenceAnchors` fields designed for exactly this).

**Bucket C — General diagnostic principles (legitimate; belong in prompts).**
Rules about *how* to diagnose, independent of trade. Examples:
- "User corrections override visual ambiguity."
- "When equipment is clearly identifiable, diagnose; do not over-clarify."
- "If a component is named explicitly and the symptom uniquely implicates it, the diagnosis is confident even without a photo."

These are reasoning principles. They belong in prompts. They must be phrased as **general rules**, not as worked examples with trade names attached.

### What's actually wrong today

The prompts mix all three buckets in the same paragraphs. "USER CORRECTIONS BEAT THE PHOTO" is a Bucket C principle, but the same sentence cites "pool vs borehole vs irrigation, gate vs garage door motor" — those examples are Bucket B taxonomy content embedded as prose. The result: when a new trade is added, the prompt drifts out of sync with the taxonomy. When a taxonomy boundary changes, the prompt doesn't notice. When a per-case Bucket A patch sneaks in (because "we just need to fix this one case"), it sits next to legitimate Bucket B content and becomes indistinguishable.

### What this plan does

- **Bucket A content is removed entirely.** It should never have existed.
- **Bucket B content moves to `src/lib/diagnosis/diagnosis-trade-taxonomy.ts`.** That file already has the right shape; we extend `scope` / `excludes` / `inferenceAnchors` to absorb the prompt-embedded examples. The composer injects the taxonomy into prompts at runtime as structured data, not as memorised prose.
- **Bucket C content is restructured.** General principles stay in the prompts, but every example with a trade name is replaced with a general phrasing. "USER CORRECTIONS BEAT THE PHOTO" stays; "(e.g. pool vs borehole)" gets cut because the *taxonomy* already tells the model what equipment pairs exist.

**The goal is to fix the architecture so the garage door case (and ~all unseen cases) work without anyone writing a Bucket A rule for them — while Bucket B (the taxonomy) remains exactly as authoritative as it needs to be.**

## The General Pattern Behind It

The garage door case is not a one-off prompt miscalibration. It is the predictable output of **four** structural decisions in the current pipeline:

1. **A single `confidence: 0–100` integer gates the entire UX.** Agent 2a returns one number meant to capture "fault certainty." Below 85 triggers `requires_clarification=true`. One number cannot capture orthogonal dimensions of uncertainty — trade-level certainty, component-level certainty, cause-level certainty, image-quality sufficiency. They get conflated, and the threshold is impossible to calibrate globally.

2. **Agent 2c (diagnostic reasoning) is a sidecar, not the decider.** It produces a hypothesis tree with per-hypothesis confidence, but the *commit-vs-clarify* decision still comes from Agent 2a's single integer. Agent 2b writes prose without seeing Agent 2c's chosen hypothesis. The hypothesis tree exists but decorates rather than drives.

3. **There is no recorded "why it failed" signal.** When a diagnosis loops or commits low, the DB records the outcome but not the model's reasoning about *what knowledge gap caused it*. Every debugging session is a JSONB grep + vibes. Refining the system has no telemetry to refine against.

4. **The prompts themselves are an accretion of per-case patches.** The prompts are prose with embedded examples that were added in response to past incidents. There is no structural decision rubric — only a wall of English instructions and worked examples. This biases the model toward the worked cases and against everything else. (Evidence below.)

These four are coupled. Fixing the prompts in isolation plays whack-a-mole. Fixing the architecture without restructuring the prompts means the prompts will rot the architecture from inside. Both must move together.

## Evidence: What the Prompts Look Like Today

Direct excerpts from `src/features/diagnosis/prompts/base.ts`:

> Line 5: `FOLLOW-UP MODE: ... If they correct equipment type (e.g. borehole pump vs pool pump, irrigation vs pool, gate vs garage), replace diagnosis and trade to match`
>
> Line 20: `USER CORRECTIONS BEAT THE PHOTO: If the user states what something actually is and it differs from what the image alone suggests (similar-looking pumps, motors, or pipes: pool vs borehole vs irrigation, gate vs garage door motor, etc.)`
>
> Line 27: `EXTENT OF DAMAGE & USER'S STATED NEED: When damage is extensive (e.g. whole kitchen destroyed, structural damage, need a full rebuild), the correct trade is the one that does the rebuild (e.g. "Kitchen renovation", "Building contractor")`

From `src/features/diagnosis/prompts/output-format.ts`:

> Line 82: `"confidence" must be an integer 0–100. It measures match between the photo and your label — NOT stubborn certainty after the user has corrected you. If the user says the equipment or context is different from what the image suggests, cap confidence at 75 unless a new image confirms it.`

From `src/features/diagnosis/prompts/special-cases.ts` — a file whose existence is the smell. Currently small, but is the dumping-ground for every future per-case patch.

**What this tells us:**

- The prompt is composed of **examples disguised as rules**. "pool vs borehole pump", "gate vs garage door", "kitchen renovation" — each was added after a specific case went wrong.
- There is no **decision rubric**. The model is told "below 85 → clarify" but not *how* to score 85. Scoring is left to the model's general sense.
- There is no **structural separation** between general principles and case-handling. They are intermixed in the same paragraphs.
- The "confidence" definition is ambiguous: "match between photo and label" — but also affected by user contradictions. The model has to infer what "match" means.

**Why this matters for the garage door:** the model sees a description ("spring missing on one side, opens partially, can't close"), maps it to "torsion spring failure" (correct), then has to assign a confidence. The prompt's worked examples are about *visual ambiguity* and *user corrections*. The garage door case has neither — it has a clear verbal description with no photo. There is no rubric anchor for "confident from text description alone," so the model conservatively scores 78 and clarification fires.

This is not a garage-door problem. It is a structural-prompt problem.

## Principles

Hard rules this plan holds itself to. Any phase that violates a principle gets reworked.

1. **No Bucket A (per-case diagnostic patches) anywhere in the system.** If a fix tunes behavior for one specific diagnosis or one fault scenario — naming a component, brand, or symptom that only fires for that case — it is rejected. Bucket A fixes must always be replaced with a structural change: adjust the rubric, the schema, the decision logic, or the taxonomy. The eval fixture for the case can name it; the production code cannot.

2. **Bucket B (trade taxonomy rules) lives in data, never in prose.** Trade scopes, disambiguation pairs, and subcategory boundaries belong in `src/lib/diagnosis/diagnosis-trade-taxonomy.ts` — never embedded as worked examples inside `base.ts`, `output-format.ts`, or any other prompt file. The prompts *reference* the taxonomy; they do not *duplicate* it.

3. **Bucket C (general diagnostic principles) lives in prompts, phrased generally.** Reasoning rules ("user corrections override visual ambiguity," "diagnose immediately when equipment is identifiable") stay in prompts, but trade-named examples in those sentences get cut. The taxonomy provides the equipment; the principle does the reasoning.

4. **The system explains its uncertainty, not its outcome.** When the diagnosis is unsure, the user sees *what* is unsure and *what would resolve it* — never "Unclear — More Detail Needed."

5. **Every model decision has a stored reason.** Every diagnosis emits a structured self-critique. We never debug from JSONB vibes again.

6. **Architecture is changed by data, not by anecdote.** Prompt changes must be backed by aggregate evidence (critique patterns, eval scores). One bad case is a fixture, not a prompt edit.

7. **Failure modes are observable.** Stuck loops, low-confidence commits, calibration drift — all surface in a dashboard. Anything we cannot observe, we cannot fix.

8. **Prompts and taxonomy are code.** Both get versioned, A/B tested, regression-checked. They are not "tuned" — they are *engineered*. A taxonomy update is a code change; a prompt update is a code change.

9. **The eval suite is the ratchet.** No phase ships if it regresses any locked fixture. The fixture set grows monotonically.

## Goals

1. Decisions about commit-vs-clarify are made from **structured uncertainty signals** with an explicit rubric — not a single integer threshold and not from prose-embedded examples.
2. Every diagnosis emits a **self-critique** that records what was considered, what was decided, and what knowledge gap (if any) prevented confident commitment.
3. The user-facing UI for any unsure diagnosis is a **custom Honest Uncertainty screen** that names the leading hypothesis, the specific gap, and the resolution path. "Unclear — More Detail Needed" is structurally impossible.
4. The prompts are **restructured into a decision schema** — explicit fields the model fills in (observations → hypotheses → evidence → rubric-scored confidence) — with all per-case examples removed.
5. A **production dashboard** surfaces stuck loops, calibration drift, and failure-mode distributions — clickable down to per-conversation critique.
6. The eval suite **proves** the system handles the garage door case (and 50+ representative scenarios across all trades) before any V2 rollout, with regression baselines locked in CI.

## Non-Goals

- Adding manual calibration notes for specific trades or components. **Forbidden by Principle 1.**
- Special-case prompt blocks ("if user mentions X, do Y"). **Forbidden by Principle 1.**
- Rewriting Agent 2c. Its output schema is already sound; we upgrade what it drives.
- Replacing Gemini. All changes work within the existing model surface.
- Migrating the existing `diagnoses` table away from JSONB. We add columns, not restructure.
- "Tuning" prompts by hand-editing wording. **Forbidden by Principle 6.** All changes go through versioning + eval.
- A blanket confidence-boost for all diagnoses to reduce clarification rate. The fix must improve *correctness*, not just commit rate.

## Cost & Performance Budget

Each diagnosis currently costs ~2–3 Gemini Flash calls (~$0.0003 total). Adding the self-critique agent adds one more Flash call (~$0.0001) for a total of ~$0.0004. At 1000 diagnoses/day this is **$0.40/day** — trivial compared to the engineering value of having structured failure data.

Adding prompt+response logging adds **storage cost**, not latency cost: ~5KB per diagnosis × 1000/day = ~150MB/month. Negligible.

Latency budget: self-critique runs **fire-and-forget after response** (does not block user). Hypothesis-driven completion adds at most one extra serial step on refine (Agent 2b waits for Agent 2c instead of running in parallel) — net ~+0.5s on refine, but eliminates the "Unclear" title regeneration that currently happens after force-commit. The Honest Uncertainty screen is pure client-side rendering on existing data — no extra latency.

---

# Phases

The plan is structured so each phase delivers independent production value. Phases 0–3 are observability-first (no behavior change). Phase 4–7 are the architectural pivot plus prompt restructure. Phase 8–9 are operational tooling. Phase 10–11 prove correctness. Phase 12 cleans up. Phase 13 is the long-term self-improvement endgame.

## Phase 0 — Reproduce & Pin

**Goal:** Lock the failure cases as fixtures *before* changing anything, so every subsequent phase has an objective gate.

**Why first:** Without this, we cannot prove the architectural changes fix anything. The garage door case must be runnable as `npm test`, fail today, pass after Phase 6.

**Tasks:**

1. Author 8–10 known-failure fixtures spanning trades:
   - **Garage door, partial spring failure, text-only.** Expected: `recommended_action: commit` to "Broken torsion spring." Currently fails.
   - **Geyser thermostat, intermittent hot water, blurry photo.** Expected: `recommended_action: ask` with a *specific* question about the dial reading. Currently produces generic clarification.
   - **Sub-board tripping after rain, no photo.** Expected: `recommended_action: ask` with question about which circuit. Currently force-commits "Electrical fault."
   - **Pool pump priming failure, clear photo.** Expected: `commit` to "Pump losing prime." Currently asks if it's pool or borehole (one of the per-case rules backfiring).
   - **Bathroom drain blockage, photo of standing water.** Expected: `commit` to "Drain blocked."
   - **Cracked roof tile, photo at distance.** Expected: `ask` with photo request.
   - **Geyser leaking on ceiling, photo of water stain.** Expected: `commit_low_confidence` with hazard escalation.
   - **Light switch sparking, no photo.** Expected: `commit` with hazard warning.

2. Run each fixture against current code, document the actual output, capture the deltas in `docs/failure-baseline-2026-05.md`.

3. Wire fixtures into the existing eval runner (`src/__tests__/diagnostic-reasoning/runner.test.ts`) but mark them as `it.fails(...)` so CI doesn't break — they should be **expected-to-fail** until the architecture catches up.

4. Add a `diagnosis_outcomes` Postgres view that classifies each `diagnoses` row into: `committed_high_conf | committed_low_conf | clarification_resolved | clarification_force_committed | clarification_abandoned | rejected | unserviced`.

5. Run a one-off query against the last 30 days. Produce a baseline metrics report:
   - % requiring clarification on round 1 (today)
   - % of clarification chains that force-commit at round 2 (today)
   - % of conversations that drop off mid-clarification (no chip click within 10 minutes)
   - Distribution of `confidence` values
   - Top 5 trades by clarification rate

**Files:**
- `src/__tests__/diagnostic-reasoning/fixtures/garage-door-partial-spring.json` and ~7 others
- `supabase/migrations/YYYYMMDDHHMMSS_diagnosis_outcomes_view.sql`
- `docs/failure-baseline-2026-05.md`
- `docs/metrics-baseline-2026-05.md`

**Verification:** running `npx vitest run src/__tests__/diagnostic-reasoning/runner.test.ts` shows the expected-to-fail count matching the failure fixtures. The baseline reports exist.

**Output:** Numbered baseline + locked failure fixtures. Every later phase has an objective bar to clear.

## Phase 1 — Prompt Forensics & Audit

**Goal:** Understand *why* the current prompts produce what they produce, before changing them. Generate a structured catalog of every per-case rule, embedded example, and implicit decision criterion.

**Why now:** We do not get to redesign the prompts until we have read them as a system. "Refactor what you understand."

**Tasks:**

1. **Three-bucket prompt content audit.** Grep every prompt file for trade names, component names, brand names, and specific scenarios. Each hit gets a row in `docs/prompt-content-audit.md`:
   - File:line
   - Quote
   - **Bucket classification**: A (per-case patch), B (taxonomy content), or C (general principle with trade-named examples).
   - What incident likely caused it (if knowable from git blame).
   - For Bucket A: justification for deletion. Where (if anywhere) the general principle it approximates already exists.
   - For Bucket B: which subcategory in `diagnosis-trade-taxonomy.ts` it should migrate to. Whether the migration is into `scope`, `excludes`, or `inferenceAnchors`. Whether the taxonomy already has equivalent content (deduplicate) or this is new content to add.
   - For Bucket C: how to rephrase the sentence so the trade-named example is removed but the general principle survives.
   - Recommended action: **delete (A)**, **migrate to taxonomy file (B)**, or **rephrase generally (C)**.

   Expected distribution: most hits are Bucket B (taxonomy content leaked into prompts) or Bucket C (general principles dressed in trade examples). If we find more than a handful of Bucket A items, that's a separate red flag worth a Slack message — it means the prompt has been used as a per-case fix vector and we should examine why.

2. **Decision-rule extraction.** For every "if X then Y" rule in the prompts, write it down formally:
   - Trigger condition
   - Action
   - Rationale (if discoverable)
   - Whether it conflicts with another rule

3. **Confidence rubric reverse-engineering.** Today the model self-assigns 0–100 with one vague definition. Reverse-engineer what the *intended* rubric is by reading every reference to `confidence` and every worked example. Document gaps where the rubric is undefined.

4. **Prompt-pipeline flow diagram.** A real diagram in `docs/prompt-flow-2026-05.md` showing how `composer.ts` assembles the final prompt from `base.ts`, `output-format.ts`, `followup.ts`, `special-cases.ts`, `user-turn.ts`, `validation.ts`. Where the seams are. Where ordering matters. Where there is duplicate or conflicting content.

5. **The "what does the model actually see" capture.** For each of the 8 failure fixtures from Phase 0, capture the *exact assembled prompt* that gets sent to Gemini, and the exact response. Store in `docs/prompt-snapshots/`. This becomes the empirical baseline for any prompt redesign.

**Files:**
- `docs/prompt-patches-audit.md`
- `docs/prompt-decision-rules-2026-05.md`
- `docs/prompt-flow-2026-05.md`
- `docs/prompt-snapshots/*.txt` (one per failure fixture)

**Verification:** Every per-case patch in every prompt file is enumerated. Every rule has a row. The flow diagram matches the actual code paths in `composer.ts`.

**Output:** A complete catalog of what we are about to redesign. No code change yet.

## Phase 2 — Self-Critique Agent (the "why" tracker)

**Goal:** Every diagnosis emits structured data about what the model considered and what it found insufficient. Persistent, queryable, no manual labeling.

**Why now:** Highest-leverage observability addition. Without it, every later phase is guessing at improvement. Done early so it captures baseline behaviour during Phases 3–5 as we change things underneath.

**Design:**

A new agent — **Agent 3 (self-critique)** — runs after the main diagnosis pipeline completes. It receives:
- The user's contents (image references + text description)
- The full Agent 2a + 2b + 2c output
- Whether the diagnosis committed, requires clarification, or was rejected/unserviced
- *(Phase 3 prerequisite)*: the exact prompts that were sent

It returns:

```typescript
type DiagnosisCritique = {
    failure_mode:
        | 'none'                  // diagnosis is sound
        | 'image_quality'         // photo was insufficient
        | 'ambiguous_symptoms'    // multiple hypotheses genuinely fit
        | 'taxonomy_gap'          // need exists but no trade matches
        | 'multi_fault'           // more than one fault present
        | 'description_unclear'   // user input was too brief
        | 'prompt_blind_spot'     // model had data but failed to use it
        | 'low_signal_evidence'   // clues too weak to reach commit threshold
        | 'rubric_miscalibration' // model's score does not match the rubric
        | 'other';
    confidence_calibration: {
        agent_confidence: number;          // what Agent 2a reported
        critique_confidence: number;       // what critique thinks it should be
        delta_reasoning: string;           // why critique disagrees (or agrees)
        rubric_facets_used: string[];      // which facets actually applied
    };
    knowledge_gap: string | null;          // null if no gap; otherwise concrete description
    resolution_would_be: string | null;    // what info/photo would have closed the gap
    considered_alternatives: string[];     // hypotheses the model thought about and discarded
    surprise_signals: string[];            // observations the model did not weight enough
    prompt_hypothesis: string | null;      // which part of the prompt (if any) caused the failure
    notes_for_human_review: string;        // free-form summary, 2-3 sentences
};
```

**Why each field exists:**
- `failure_mode` — closed enum so aggregation is trivial.
- `confidence_calibration.delta_reasoning` — when critique systematically disagrees with Agent 2a on a class of cases, that *is* the prompt calibration bug.
- `knowledge_gap` + `resolution_would_be` — these power the **Honest Uncertainty screen** (Phase 7). The user sees this content rendered.
- `prompt_hypothesis` — critical for self-improvement. The critique attempts to name *which prompt section* misled the model. e.g., "The 'pool vs borehole' example in base.ts may have caused over-clarification on a clear pump description." This generates leads for prompt refactor.
- `surprise_signals` — observations the model saw but underweighted. Useful for the meta-analyst in Phase 13.

**Implementation:**
- Fire-and-forget via `void` at the end of `/api/diagnose` and `/api/diagnoses/[id]/refine`. Latency-zero impact on user.
- Uses Gemini Flash for cost; ~$0.0001 per call.
- Failures here do not break the diagnosis — they log to Sentry as a warning only.

**Files:**
- `src/features/diagnosis/agent-critique.ts`
- `src/features/diagnosis/prompts/critique-system.ts`
- `src/features/diagnosis/types.ts` — `DiagnosisCritique` type
- `supabase/migrations/YYYYMMDDHHMMSS_add_critique_column.sql` — `diagnosis_critique JSONB`
- `src/app/api/diagnose/route.ts` — fire-and-forget call
- `src/app/api/diagnoses/[id]/refine/route.ts` — same

**Verification:**
- Run all 8 failure fixtures through the system manually. Critique should:
  - Correctly identify the failure mode
  - Disagree with Agent 2a where Agent 2a was wrong (e.g. for the garage door: critique says `agent_confidence: 78, critique_confidence: 90, delta_reasoning: "Component named directly by user, no contradicting evidence, prompt rubric undefined for text-only confident cases"`)
  - Populate `prompt_hypothesis` with a plausible suspect

**Output:** From this phase forward, every production diagnosis has a queryable "why" record.

## Phase 3 — Full Prompt + Response Logging

**Goal:** Capture every prompt sent to Gemini and every response received, in a queryable store. No more "what did the model actually see?" mysteries.

**Why now:** Phase 2 critique cites prompts as the cause of failures; Phase 5's prompt restructure requires before/after evidence. Both need raw prompt/response pairs accessible from SQL.

**Design:**

- New table: `ai_call_log`
  - `id`, `created_at`
  - `conversation_id` (FK)
  - `agent_id` ('2a' | '2b' | '2c' | '3-critique')
  - `prompt_text` (full assembled prompt, plain text)
  - `prompt_version` (from `prompt-version.ts`)
  - `model_id`, `temperature`, `top_p`, `top_k`
  - `response_text` (raw, before parsing)
  - `response_json` (parsed structured output, JSONB)
  - `latency_ms`, `input_tokens`, `output_tokens`
  - `error` (if any)

- Logging is **synchronous before response but non-blocking on write**: write happens in `Promise.allSettled` alongside any other post-call work. A logging failure never breaks a diagnosis.

- Retention: 90 days. Older rows are pruned by a weekly cron. (Cost-control — at 5KB/row × 3 calls/diagnosis × 1000/day, that's ~14GB/90d which is fine.)

**Privacy:** images are not logged here (they live in object storage already); text descriptions are. The DB is internal-only; no PII risks beyond what's already in `conversations`.

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_create_ai_call_log.sql`
- `src/lib/ai/ai-call-logger.ts` — thin write helper
- `src/lib/ai/gemini-client.ts` (or wherever calls are made) — wire the logger
- `src/app/api/cron/prune-ai-call-log/route.ts` — pruning job

**Verification:** After a single diagnosis, `select * from ai_call_log where conversation_id = ?` returns one row per agent call, each with non-null prompt and response.

**Output:** Every prompt and response is now archived and queryable.

## Phase 4 — Structured Uncertainty Schema

**Goal:** Replace the single `confidence` integer with explicit facets, so each downstream consumer reads the dimension that actually matters.

**Why now:** Unblocks Phase 6 (hypothesis-driven completion) by giving it the right inputs. Also enables Phase 7's Honest Uncertainty screen.

**New Agent 2a output schema:**

```typescript
type ClassificationV2 = {
    trade: string;
    trade_detail: string;
    trade_confidence: number;       // 0-100: how sure about WHICH trade
    component_confidence: number;   // 0-100: how sure about WHICH component
    cause_confidence: number;       // 0-100: how sure about ROOT CAUSE
    image_sufficiency: 'sufficient' | 'partial' | 'unhelpful' | 'absent';
    committed_observations: string[]; // facts the model treats as established
    explicit_unknowns: string[];      // things the model knows it doesn't know
    // Legacy field, computed for back-compat during shadow period:
    confidence: number; // min(component_confidence, cause_confidence)
};
```

Three separate confidence numbers replace the one. Each measures a real, distinct thing. The composite `confidence` is computed only for back-compat during shadow run.

**The garage door case under this schema:**
- `trade_confidence: 95` (clearly Security/garage door)
- `component_confidence: 90` (torsion spring described directly)
- `cause_confidence: 85` (mechanical breakage — known from "missing on one side")
- `image_sufficiency: absent` (no photo provided)
- `committed_observations: ["door opens partially", "door cannot close", "spring missing on one side"]`
- `explicit_unknowns: ["whether cable is also damaged", "whether opener motor still functions"]`

Each facet has a clear definition. The model's rubric (Phase 5) tells it how to score each.

**Files:**
- `src/features/diagnosis/agent-classify.ts` — new output schema + parser
- `src/features/diagnosis/types.ts` — add `ClassificationV2`

**Verification:** Re-run all existing eval fixtures with V2. Schema parses. Each facet is populated.

## Phase 5 — Prompt Restructure: Decision Schema + Taxonomy as Data

**Goal:** Rewrite the prompts as a **decision schema** with an explicit **rubric**, and move all Bucket B (taxonomy) content out of the prompts into `diagnosis-trade-taxonomy.ts` where it already belongs. Bucket A patches are deleted. Bucket C principles are kept but rephrased generally.

**This is the most invasive phase. It addresses Principles 1, 2, and 3 directly.**

### What changes structurally

#### Before (today's prompts, simplified)

```
You are an expert diagnostic AI.
- USER CORRECTIONS BEAT THE PHOTO: If the user states... pool vs borehole...
- When equipment is clearly visible, give a full diagnosis...
- Be PROACTIVE: ... gate motor, water pump, circuit breaker ...
- ESTIMATED DIAGNOSIS: ... "Burnt capacitor in gate motor", "Geyser thermostat failure" ...
- EXTENT OF DAMAGE: ... "Kitchen renovation", "Building contractor" ...

confidence: integer 0–100. Below 75 → requires_clarification.
```

A prose wall with embedded examples. Brittle, untestable, hard to refactor.

#### After (target shape)

The model is required to produce reasoning before answer, with explicit scoring per facet:

```
TASK
Diagnose the fault. Score your certainty across four facets using the rubric.

REASONING SCHEMA (fill in order)
1. observations: array of concrete facts from image+text. Each item is one fact.
2. candidate_hypotheses: array of {label, supporting_observations[], conflicting_observations[]}.
3. rubric_scoring: for each facet, apply the rubric below:

TRADE-CONFIDENCE RUBRIC
  +30: equipment in image matches exactly one supported trade scope
  +30: user named the trade or service explicitly
  +20: user named a component associated with exactly one trade
  +10: symptoms map to only one trade
  -20: image contradicts user statement on equipment type
  -20: multiple supported trades plausibly fit
  Floor: 30. Ceiling: 100.

COMPONENT-CONFIDENCE RUBRIC
  +30: failed component is visible in image
  +30: user named the failed component explicitly
  +20: the symptom uniquely implicates one component (e.g. "spring missing" → torsion spring)
  +10: component is the most common failure for the equipment+symptom pair
  -20: more than one component could produce the observed symptom
  -10: image quality prevents component identification

CAUSE-CONFIDENCE RUBRIC
  +30: cause is implied by the failure mode (a broken thing has broken)
  +20: cause is the dominant failure path for the component
  +10: secondary supporting evidence (rust, scaling, age, weather)
  -20: multiple causes could produce the same symptom
  -10: user description introduces a cause inconsistent with the photo

IMAGE-SUFFICIENCY ENUM
  sufficient — the fault can be identified from this image alone
  partial — image shows context but the failed component is obscured
  unhelpful — image is present but adds no diagnostic value
  absent — no image was provided

4. final_decision: based on the facet scores and image_sufficiency, output the structured diagnosis.

OUTPUT FORMAT
... structured JSON as today, but with facet scores ...
```

Notice what is **gone from the prompt**, and where each piece **goes** instead:

- ❌ "pool vs borehole vs irrigation, gate vs garage door motor" (was inline prose) → ✅ moves to taxonomy file as `excludes` entries on the relevant subcategories. The taxonomy already has `gate_motor_fault.excludes` pointing at `garage_door_fault`; we extend it to cover all the disambiguation pairs currently embedded in prose.
- ❌ "Kitchen renovation", "Building contractor" (was inline prose) → ✅ moves to taxonomy as either a `scope` extension on the relevant Building & Construction subcategory or a new subcategory if one is missing.
- ❌ "Burnt capacitor in gate motor", "Geyser thermostat failure" (was inline prose under "ESTIMATED DIAGNOSIS") → ✅ deleted. These were Bucket A examples — they showed the model worked outputs and biased it toward those exact phrasings. The general principle ("the diagnosis title must name a specific failed component or condition, not a service category") stays in prompt as Bucket C, with no examples attached.
- ❌ Every other trade-named example sentence (Bucket A patches and Bucket C examples mixed together) → ✅ classified per Phase 1's audit, then deleted (Bucket A), migrated to taxonomy (Bucket B), or rephrased generally (Bucket C).

What replaces them in the prompt: a **rubric the model self-applies** + a runtime-injected **taxonomy snapshot**. The rubric encodes the general principles. The taxonomy snapshot is structured data, not prose.

### How the taxonomy reaches the model

The composer (`prompts/composer.ts`) gains a new step: it serialises the taxonomy as a compact structured block and injects it into the prompt at runtime. Something like:

```
TRADE TAXONOMY (use this to classify; do not infer trade scopes from your training data)

Security
  • gate_motor_fault — "Gate Motor / Gate Fault"
    Scope: residential/commercial driveway gates — motor, gearbox, control board…
    Excludes: garage doors on ceiling track → garage_door_fault; intercom → intercom_access_control
  • garage_door_fault — "Garage Door Fault / Repair"
    Scope: residential garage doors — torsion spring, cable, opener motor, rails…
    Excludes: driveway gates → gate_motor_fault

Plumbing
  • geyser_fault — …
  • borehole_pump_fault — …
    Excludes: pool pump → pool_pump_fault; irrigation pump → irrigation_pump_fault
  …
```

This block is generated by `composer.ts` from `TAXONOMY_SUBCATEGORIES` — there is **no duplication**. If the taxonomy file changes, the prompt changes the next request. The prompt files contain *zero* hard-coded trade names; the taxonomy file is the single source of truth.

### Why this works structurally

1. **Scoring is auditable.** Critique (Phase 2) can examine the rubric application and identify miscalibration: "model applied +30 for visible component, but the component isn't actually visible." This is impossible with today's "the model just felt 78 was right" prompt.

2. **The garage door case scores correctly without anyone naming garage doors.**
   - Component confidence: user named "spring" explicitly (+30), symptom uniquely implicates torsion spring (+20). Score: 50 base + 30 + 20 = ~90 minus any small penalties. Above the commit threshold.
   - No garage door rule needed. The general principle ("user named the component" + "symptom uniquely implicates") fires for any case where it's true.

3. **`special-cases.ts` is no longer needed.** Its content is reclassified:
   - `UNRELATED_IMAGE_PROMPT_BLOCK` → Bucket C principle ("if the image is not home-related, set rejected=true"); folded into the base prompt as a general rule, not a "special case."
   - `UNSUPPORTED_HOME_SERVICE_PROMPT_BLOCK` → Bucket B taxonomy concern. Becomes a top-level taxonomy check (does any subcategory's scope cover this?) that runs *before* the diagnostic agent. Lives in `lib/diagnosis/`, not in prompts.
   - The file is deleted. The name itself ("special cases") was the bug — anything that needs a "special case" file is something we didn't model properly.

4. **The composer is simplified.** `composer.ts` no longer needs to conditionally inject special-case blocks. It assembles a constant base + per-request user content.

5. **Prompt diffing becomes meaningful.** Today a prompt change might be "add a sentence about pool pumps." Tomorrow a prompt change is "adjust the COMPONENT-CONFIDENCE rubric weight from +30 to +25 for visible-component cases." The latter is a tuning lever; the former is a band-aid.

### Specific files touched

- **DELETE** `src/features/diagnosis/prompts/special-cases.ts` (its content is redistributed per the reclassification above).
- **REWRITE** `src/features/diagnosis/prompts/base.ts` — remove every Bucket A patch (delete), every Bucket B trade reference (move to taxonomy file), and every Bucket C trade-named example (rephrase generally). What remains is principle-only prose, with no proper nouns.
- **REWRITE** `src/features/diagnosis/prompts/output-format.ts` — update JSON schema to include `trade_confidence`, `component_confidence`, `cause_confidence`, `image_sufficiency`, `committed_observations`, `explicit_unknowns`, `rubric_application` (an audit log of which rubric items fired).
- **REWRITE** `src/features/diagnosis/prompts/composer.ts` — inject the taxonomy snapshot as a structured block (generated from `TAXONOMY_SUBCATEGORIES`); remove every conditional special-case injection.
- **EXTEND** `src/lib/diagnosis/diagnosis-trade-taxonomy.ts` — absorb every Bucket B item from the Phase 1 audit into the existing `scope`, `excludes`, and `inferenceAnchors` fields. Add new subcategories where Phase 1 finds the prompts implied a scope the taxonomy doesn't yet cover.
- **KEEP & ADJUST** `src/features/diagnosis/prompts/followup.ts` — adjust to match new schema; same Bucket A/B/C cleanup applies.
- **NEW** `src/features/diagnosis/prompts/rubrics.ts` — single canonical source of the rubric definitions.
- **NEW** `src/features/diagnosis/prompts/taxonomy-serializer.ts` — turns `TAXONOMY_SUBCATEGORIES` into the structured prompt block. Tested independently.

### Migration: shadow first

Phase 5 is shipped behind `DIAGNOSIS_PROMPT_V2`. Both V1 and V2 prompts run in shadow against the same input for 1 week. Critique (Phase 2) runs on both. Comparison metrics:
- Aggregate confidence calibration delta
- Per-trade clarification rate
- Per-fixture pass/fail

Cutover only when V2 dominates V1 on aggregate metrics AND no fixture regresses.

**Verification:**
- All 8 failure fixtures from Phase 0 must now pass (or be one step closer — e.g. garage door must produce `component_confidence >= 85` even before Phase 6's completion logic).
- No existing passing fixture regresses.
- **Prompt files contain zero trade names** (`grep -rE "(pool|borehole|garage|gate|kitchen|geyser|capacitor|thermostat|spring|geyser|hvac|plumbing|electrical)" src/features/diagnosis/prompts/` returns zero hits). Trade names live in `diagnosis-trade-taxonomy.ts` (expected — that is the data source) and in eval fixtures (expected — that is what they test).
- **Taxonomy is the single source of truth.** A unit test asserts: every trade name that appears in the runtime-assembled prompt also appears in `TAXONOMY_SUBCATEGORIES`. If the prompt mentions a trade not in the taxonomy, the test fails (catches drift).
- **The taxonomy itself has at least as much disambiguation content as the prompts had before.** A diff between Phase 1's audit and the post-Phase-5 taxonomy file shows every Bucket B item was migrated, not lost.

**Output:** The prompts are now structured code, not accumulated prose. The taxonomy file is the canonical home for trade scopes and disambiguations. Future changes are rubric tunings or taxonomy edits — never per-case prompt patches.

## Phase 6 — Hypothesis-Tree-Driven Completion

**Goal:** The decision to commit vs. clarify is computed from Agent 2c's hypothesis tree and Agent 2a's facet scores, not from any single confidence number or threshold.

**Completion criteria** (all must hold for `commit`):
1. Top hypothesis `confidence_alone >= 0.75`
2. Gap to second hypothesis `>= 0.25` (no close runner-up)
3. Top hypothesis has at least one `evidence_for` entry and at most one *non-trivial* `evidence_against` entry
4. From Phase 4 facets: either `image_sufficiency != 'absent'` OR both `component_confidence >= 85` AND `cause_confidence >= 85`

If all hold → **commit**.

If at least one fails AND there exists a chip that meaningfully reduces uncertainty → **ask**.

Else → **commit_low_confidence** (force-commit path; user sees Honest Uncertainty screen in Phase 7).

**New Agent 2c field:**

```typescript
recommended_action: 'commit' | 'ask' | 'commit_low_confidence';
```

This is authoritative. Agent 2a's `confidence` is no longer consulted for gating.

**Files:**
- `src/features/diagnosis/agent-reasoning.ts` — emit `recommended_action`
- `src/app/api/diagnose/route.ts` — read `recommended_action`
- `src/app/api/diagnoses/[id]/refine/route.ts` — same
- `src/features/diagnosis/prompts/critique-system.ts` — also evaluate the recommendation

**Verification:** All Phase 0 fixtures produce the expected `recommended_action`.

## Phase 7 — Prose Conditioning + Honest Uncertainty UX

**Goal:** Two changes, tightly coupled:
1. Agent 2b writes prose for the chosen hypothesis, not generic "we think it might be."
2. When the system is unsure, the user sees a **custom Honest Uncertainty screen** that explains *what* is unsure and *what would resolve it* — never "Unclear — More Detail Needed."

### Prose conditioning

In `/refine` and `/diagnose`, the pipeline becomes:

```
parallel(Agent 2a, Agent 2c)
  → Agent 2b(seeded with top hypothesis + recommended_action + facet scores)
```

Net cost: ~+0.3s vs current parallel structure. Buys us:
- "Unclear — More Detail Needed" disappears from titles when `recommended_action !== 'ask'`.
- Hedged prose is correctly hedged when `commit_low_confidence`, not bolted on.
- Action_required matches the actual hypothesis, not a generic placeholder.

**Agent 2b prompt update** (still following Principle 6 — no per-case content):

- Receives `chosen_hypothesis` + `recommended_action` + `facet_scores`.
- If `commit`: confident prose for the hypothesis.
- If `commit_low_confidence`: hedged prose that names the most-likely cause and explicitly says "site visit recommended to confirm." Title format: `"<Hypothesis> (likely)"`.
- If `ask`: writes a holding message that frames the next question. **Never the doom-loop "Unclear — More Detail Needed"**. The title is dynamic — the *question being asked* becomes part of the title.

### Honest Uncertainty Screen (new UI)

Today: `requires_clarification=true` shows a generic full-screen "What Else Should We Know?" overlay. The user has no idea why they are being asked.

Tomorrow: the same path renders a structured screen with four sections:

```
┌─────────────────────────────────────────────────────┐
│ Still figuring this out                             │
│                                                     │
│ Most likely: Broken torsion spring (75%)            │
│ ━━━━━━━━━━━━━━━━━━━░░░░░░                          │
│ Possible: Cable failure (40%)                       │
│ ━━━━━━━━━━░░░░░░░░░░░░░░                          │
│                                                     │
│ What I'm not sure about                             │
│ Whether the lifting cable is also slack — that      │
│ changes whether it's a quick fix or full rebuild.   │
│                                                     │
│ This would help                                     │
│ A photo of the door's bottom edge, OR confirm:      │
│   [ ] Cables look loose on both sides               │
│   [ ] Cables look tight on both sides               │
│   [ ] One side is loose, one is tight               │
│   [ ] Not sure                                      │
│                                                     │
│ [ Add a photo ]   [ Continue with best guess ]      │
└─────────────────────────────────────────────────────┘
```

Every field on this screen comes from data the model already produces:
- "Most likely / Possible" — top 2 hypotheses from Agent 2c.
- "What I'm not sure about" — `what_we_dont_know` (Agent 2c) cross-referenced with `knowledge_gap` (Critique).
- "This would help" — `resolution_would_be` (Critique) + Agent 2c chips.
- Options — Agent 2c discriminating chips.

**This screen exists whenever `recommended_action !== 'commit'`** — including when the system force-commits (the user can still see the uncertainty story, alongside the best-guess diagnosis).

**Files:**
- `src/features/diagnosis/agent-prose.ts` — accept `chosenHypothesis` + `recommendedAction` + `facetScores`
- `src/features/diagnosis/prompts/agent-prose-prompt.ts` (new) — replaces inline prose rules
- `src/app/api/diagnose/route.ts` + `refine/route.ts` — restructure pipeline
- `src/app/diagnosis/honest-uncertainty.tsx` (new) — the screen
- `src/app/diagnosis/client.tsx` — replace `showAddInfoScreen` overlay invocation with `<HonestUncertaintyScreen />` when applicable

**Verification:**
- Contract test: when `recommended_action !== 'ask'`, the diagnosis title is not "Unclear — More Detail Needed."
- Visual test: the Honest Uncertainty screen renders with the correct top hypotheses, gap, and resolution path for each Phase 0 failure fixture.

## Phase 8 — Stuck-Loop Detection & Recovery

**Goal:** Even with the new architecture, edge cases will hit round 2 without resolution. Detect them, recover gracefully, alert.

**Tasks:**
- Add `last_critique_action: 'continue' | 'force_commit' | 'escalate' | 'reject'` column.
- After force-commit (round 2), Agent 3 critique sets this column based on whether the commit is defensible.
- Daily cron finds conversations where `clarification_round >= 2 AND created_at < now() - interval '1 hour' AND last_critique_action IS NULL` and runs critique on them (catches missed cases).
- Sentry breadcrumb when a conversation hits round 2 — payload includes `failure_mode` from critique.
- Slack/email alert when a single `failure_mode` accounts for >20% of round-2 events in a rolling 24h window.

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_critique_action.sql`
- `src/app/api/cron/critique-backfill/route.ts`
- `src/lib/ai/sentry-integration.ts` — breadcrumb wiring

## Phase 9 — Observability Dashboard + Pattern Detection

**Goal:** A `/admin/diagnoses` route that surfaces the data Phases 0–8 produced — and proactively flags prompt-improvement opportunities.

**Tabs:**

1. **Live failures** — conversations stuck in clarification right now, oldest first. Click for full critique JSON.

2. **By failure mode** — aggregated `failure_mode` counts over 7/30 days. Drill down to conversation list. Each conversation row shows agent, prompt version, facet scores.

3. **Confidence calibration** — scatter of `agent_confidence` vs `critique_confidence` per diagnosis. Points far off the diagonal are systematic miscalibration. **Hovering a cluster suggests a prompt fix** — e.g., "47 cases cluster at agent_confidence=78 / critique_confidence=90; common factor: `failure_mode=prompt_blind_spot` + `prompt_hypothesis` mentions 'no visible component but verbal description complete'. Suggested rubric change: increase COMPONENT-CONFIDENCE +30 weight for `user named the component` to be sufficient absent any contradicting evidence."

4. **By trade** — per-trade clarification + force-commit rates, with diff vs baseline (Phase 0).

5. **Prompt version comparison** — when V2 prompts are running in shadow, side-by-side metrics. V1 vs V2.

6. **Conversation detail** — full critique JSON, all images, all refine events, the **assembled prompt** sent to each agent (from Phase 3 logs), the **response** received. The full reproduction record.

**Pattern detection:** A weekly cron analyses `diagnosis_critique` rows and produces `docs/critique-patterns/YYYY-MM-DD.md` — a report by `failure_mode` × `prompt_hypothesis` × frequency. Top 5 patterns surface as **suggested rubric changes** (not commits — humans decide).

**Files:**
- `src/app/admin/diagnoses/page.tsx`
- `src/app/admin/diagnoses/[id]/page.tsx`
- `src/app/api/admin/diagnoses/route.ts`
- `src/app/api/cron/weekly-critique-patterns/route.ts`

## Phase 10 — Multi-Trade Eval Suite + Prompt A/B Infrastructure

**Goal:** Prove the V2 architecture and prompts work across all supported trades. Lock the proof in CI.

**Scope note — all real-Gemini-key fixture runs happen here, not earlier.** Phases 0–9 do not invoke the live API to "observe" V1 behaviour on fixtures. The Phase 0 failure-baseline doc records *predicted* V1 outputs with the structural reason for the prediction; ad-hoc real-key runs during earlier phases are forbidden because they burn budget without contributing to the locked baseline. The first real-key sweep lives behind the runner this phase introduces.

**Tasks:**

1. Expand `src/__tests__/diagnostic-reasoning/fixtures/` to ~50 fixtures:
   - 8–10 per supported trade (electrical, plumbing, security, HVAC, building, etc.)
   - Each declares `expected_recommended_action`, `expected_failure_mode_if_clarification`, and key facet score ranges.
2. Add a **regression baseline** file locking current pass rate. CI fails if pass rate drops on any fixture.
3. Add a **real-Gemini-key runner** (`src/__tests__/diagnostic-reasoning/eval.ts`) that hits actual API and writes a JSON report. Manual run only (cost: ~$2 per full sweep). **First task this runner performs on day one: a full sweep across the Phase 0 failure fixtures, to convert their predicted V1 outputs in `docs/failure-baseline-2026-05.md` into observed outputs.**
4. Add a **prompt A/B framework**: any prompt version change runs both versions against the full fixture suite + a sample of recent production data via Phase 3 logs. The framework outputs a delta report.

**Files:**
- `src/__tests__/diagnostic-reasoning/fixtures/*.json` (~43 new files)
- `src/__tests__/diagnostic-reasoning/runner.test.ts` — extended
- `src/__tests__/diagnostic-reasoning/eval.ts` — real-key runner
- `src/__tests__/diagnostic-reasoning/prompt-ab.ts` — A/B framework
- `src/features/diagnosis/prompts/prompt-version.ts` — versioning bump

## Phase 11 — Shadow Run & V2 Rollout

**Goal:** De-risk the architectural + prompt change by running V2 in shadow before flipping users.

**Tasks:**
- `DIAGNOSIS_V2_ENABLED` env flag with values `off | shadow | on`.
- In `shadow`: V2 runs alongside V1; V1's output is returned to the user; V2 output is logged to `diagnosis_shadow_results`.
- Run shadow for 2 weeks. Compare:
  - V2 clarification rate vs V1 (target: ≥30% reduction on noisy trades)
  - V2 critique failure_mode distribution vs V1 (target: `prompt_blind_spot` count down ≥50%)
  - V2 latency P50/P95 (target: no regression beyond +500ms on refine)
  - Zero "Unclear — More Detail Needed" titles
- Promote to `on` when all targets met AND no fixture regresses.
- V1 path stays available behind flag for 30 days post-cutover.

**Files:**
- `src/lib/diagnosis/pipeline-router.ts` — V1/V2/shadow router
- `supabase/migrations/YYYYMMDDHHMMSS_add_shadow_results.sql`

## Phase 12 — Cleanup

Carried over and amended:

- Audit all cache-invalidation paths (`invalidateConversationDiagnosisCache`).
- Replace `bootstrappedForRef` band-aid in `src/app/diagnosis/client.tsx` with proper React Query–style data fetching.
- Audit `hedging-guard.ts` — likely redundant once Agent 2b is conditioned on chosen hypothesis. Probably delete.
- Delete legacy `confidence < 85` references (now dead code).
- Delete `special-cases.ts` (now unused — its content was redistributed in Phase 5).
- Update `CLAUDE.md` with the new pipeline shape, decision rules, and prompt architecture.
- Remove the legacy "Unclear — More Detail Needed" title literal anywhere it appears as a constant.

## Phase 13 (stretch) — Auto-Improvement Loop

**Goal:** Long term, the system proposes prompt improvements automatically based on critique data.

**Design:**

- A **meta-analyst agent (Agent 4)** runs weekly. Reads the last 7 days of `diagnosis_critique` rows. Identifies systematic patterns: clusters of `failure_mode + prompt_hypothesis` that recur.
- For each pattern, generates a **proposed rubric change** — e.g., "COMPONENT-CONFIDENCE rubric: add `+10 if symptom uniquely implicates a single component class (no equivalent ambiguity)`". The proposal is a structured diff against the current rubric file.
- The proposal runs through the A/B framework (Phase 10) automatically: V_current vs V_proposed against the full fixture suite + sampled production traffic.
- The A/B report lands in `docs/proposed-prompt-changes/YYYY-MM-DD.md`. Humans review and approve.
- No automatic merge. The loop is **propose → evidence → human approve**, not propose → ship.

**Why this is stretch:** it requires Phases 1–12 to be solid first. But once in place, it removes the human bottleneck on prompt refinement entirely.

**Files:**
- `src/lib/ai/agent-meta-analyst.ts`
- `src/app/api/cron/weekly-meta-analysis/route.ts`
- `docs/proposed-prompt-changes/` (output directory)

---

# Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Self-critique adds Gemini cost without changing behavior | Capped at one Flash call per diagnosis; ~$0.40/day at 1000/day; off behind env flag if needed |
| Critique LLM is itself miscalibrated | Phase 10 includes critique-self-eval fixtures: cases where we know the right critique answer. Track critique drift. |
| Agent 2c's `recommended_action` is itself miscalibrated | Phase 10 eval + Phase 11 shadow catch this before rollout |
| Latency regression from re-serialising 2b after 2c | Measured in shadow; +0.5s budget; fall back to parallel 2b with seeded hypothesis-shape if needed |
| Rubric in prompt is too rigid; model ignores it | Phase 2 critique includes `rubric_facets_used` — if the model is not applying rubric items, prompt phrasing is wrong; iterate via A/B |
| Killing `special-cases.ts` loses behavior that depended on it | Phase 1 prompt forensics audit enumerates every rule first; Phase 5 redistributes each one before delete |
| New columns balloon DB size | All JSONB or small; expected growth ~5KB per diagnosis + ~15KB per `ai_call_log` row (capped 90d) |
| Shadow comparison is unreliable | V2 shadow runs use identical inputs; only pipeline logic differs |
| The Honest Uncertainty screen feels worse to users than "Unclear" | UX-test with 5 users before promoting V2 to `on`. If the screen confuses, simplify wording (but the *data shape* stays) |
| Prompt A/B framework adds friction to prompt changes | Tooling is one CLI command: `npm run prompt:ab <new-version>`. If friction is real, reduce it; don't skip A/B. |

# Success Criteria

By end of Phase 11, all of these must be true compared to Phase 0 baseline:

1. **Clarification rate drops by ≥30%** for trades where Phase 0 showed >20% clarification rate.
2. **Force-commit rate drops by ≥50%** (V2's hypothesis-tree completion resolves cases V1 force-committed).
3. **Zero conversations** with `requires_clarification=true` AND title "Unclear — More Detail Needed" — that combination is now structurally impossible.
4. **All 50 fixtures pass** in eval suite on real Gemini, including the 8 Phase 0 failure fixtures.
5. **Self-critique data is populated on >99% of diagnoses** (allowing for transient Gemini failures).
6. **`prompt_blind_spot` failure mode drops by ≥50%** between Phase 2 baseline and post-Phase-5 cutover.
7. **Dashboard usable**: admin can identify a stuck conversation, see its critique, see the exact prompt and response, and articulate why it failed — without reading code.
8. **The prompts contain zero trade names**: `grep -rE "(pool|borehole|garage|gate|kitchen|geyser|capacitor|thermostat|spring|hvac|plumbing|electrical|security|locksmith)" src/features/diagnosis/prompts/` returns empty. Trade names appear *only* in `src/lib/diagnosis/diagnosis-trade-taxonomy.ts` (the data source) and in eval fixtures (the tests).
8a. **Taxonomy ↔ prompt sync test passes**: a unit test confirms every trade name that appears in a runtime-assembled prompt is sourced from `TAXONOMY_SUBCATEGORIES` and not hard-coded.
8b. **Phase 1's Bucket B audit is fully absorbed**: every Bucket B item identified in `docs/prompt-content-audit.md` has a corresponding entry in `diagnosis-trade-taxonomy.ts`.
9. **Honest Uncertainty screen renders for all `recommended_action !== 'commit'` cases** with the correct top hypotheses, gap, and resolution path.
10. **Calibration scatter (Phase 9, tab 3) is tighter** — mean absolute delta between `agent_confidence` and `critique_confidence` drops below 10 (post-Phase-5) from baseline (likely >20 today).

---

# Execution Order

Phases 0, 1, 2, 3, 8, 9, 10, 12 can be done independently of the architectural change. They deliver value even if V2 never ships.

Phases 4, 5, 6, 7, 11 are the architectural + prompt pivot and must be done in order (5 depends on 4; 6 depends on 4; 7 depends on 6).

**Recommended sequence:**

```
0 (1d) → 1 (2d) → 2 (2d) → 3 (1d)
                     ↓
                     4 (2d) → 5 (4d, biggest single phase) → 6 (3d) → 7 (3d)
                                ↓                                       ↓
                                ↓                                       8 (1d)
                                ↓                                       ↓
                                10 (parallel, 4d) ←──────────────────── 9 (3d)
                                       ↓
                                       11 (2 weeks shadow + 1d cutover)
                                                  ↓
                                                  12 (2d)
                                                  ↓
                                                  13 (stretch, ongoing)
```

Total: ~5 weeks of focused engineering + 2 weeks of shadow observation. Phase 5 alone is the longest single chunk (4 days) — it's the prompt restructure and it must be done carefully.

# Open Questions for Matthew

1. **Cost ceiling for self-critique.** Are we comfortable with ~$0.40/day extra Gemini cost? *(Recommended: yes — debugging value is high. If cost rises faster than expected, sample to 25% of traffic.)*

2. **Dashboard hosting.** Should `/admin/diagnoses` be its own route or merged into the existing admin area? *(Recommended: new route. The data shape is too different from existing admin pages.)*

3. **Backfilling critique data on historical diagnoses.** Forward-only or backfill? *(Recommended: forward-only. Historical data is biased by V1's behavior; backfill would just re-confirm V1 was wrong.)*

4. **Eval suite size before architectural change starts.** Phase 10 has the full 50 fixtures, but should Phase 0 already include 20+ (not 8) so Phase 5/6 have a denser regression net? *(Recommended: 8 in Phase 0 covering the worst cases, full 50 in Phase 10. Eight is enough to gate Phase 5/6.)*

5. **Honest Uncertainty screen visual design.** Do we want the side-by-side hypothesis bars (as drafted) or a simpler narrative format? *(Recommended: bars + narrative. Users see uncertainty as a *number* more intuitively than as prose. Test on 5 users before locking.)*

6. **Phase 13 (auto-improvement loop) commitment.** Stretch goal or planned? *(Recommended: stretch. Ship Phases 0–12 first; Phase 13 becomes attractive once we have 60+ days of critique data accumulated.)*

7. **Kill switch for V2.** What happens if production V2 produces a regression we didn't see in shadow? *(Recommended: `DIAGNOSIS_V2_ENABLED=off` reverts instantly; keep this lever for 30 days post-cutover.)*

---

# Summary

The garage door incident is not a prompt bug to be patched. It is the natural output of a system that:

1. Squashes multi-dimensional uncertainty into one integer.
2. Has a sidecar reasoning agent that doesn't drive decisions.
3. Has no recorded "why it failed" signal.
4. Has prompts that accumulate per-case patches instead of structural rules.

This plan addresses all four. **Phase 5 is the single highest-leverage change** — restructuring the prompts from prose with embedded examples into a rubric-driven decision schema, and deleting `special-cases.ts` entirely. Without Phase 5, the architectural phases (4, 6, 7) inherit prompt fragility from below.

The Honest Uncertainty screen (Phase 7) is the user-facing counterpart: it makes uncertainty *legible* instead of hiding it behind "Unclear — More Detail Needed."

Phase 2's self-critique is the diagnostic mirror — every production diagnosis tells us what it considered, what it failed to use, and (crucially) which prompt section it suspects misled it. This is the data substrate that lets us refine without guessing, and ultimately lets the system propose its own improvements (Phase 13).

The eval suite is the ratchet. The dashboard is the magnifying glass. The principles are the rules of engagement. **No Bucket A (per-case) patches anywhere. Bucket B (trade taxonomy) lives in data, never prose. Bucket C (general principles) lives in prompts, never with trade-named examples.** Three buckets, three homes — that's the architectural rule the garage door incident taught us.
