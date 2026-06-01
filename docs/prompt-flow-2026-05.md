# Prompt Pipeline Flow & Refine-Route Tracing — 2026-05

**Phase:** 1 (Prompt Forensics & Audit)
**Source plan:** [Diagnosis-Architecture-Hardening-Plan.md](./Diagnosis-Architecture-Hardening-Plan.md) §Phase 1 task 4.
**Companions:** [prompt-content-audit.md](./prompt-content-audit.md), [prompt-decision-rules-2026-05.md](./prompt-decision-rules-2026-05.md).

## Why this document exists

Two things that the plan demands and that earlier audits left implicit:

1. **How `composer.ts` assembles the final prompt.** What gets included, in what order, with which conditional branches. Where the seams are, where ordering matters, where content is duplicated.
2. **How the clarification → resolution chain actually works in the refine route.** Matthew's mental model says a clarification is "resolved" when the user proceeds to `/match`, not when `requires_clarification` flips false. This doc traces the code and proves him right with data.

The most consequential finding lives in §3.

## §1 — System-prompt assembly (the `composer.ts` flow)

The diagnose route ([route.ts:165](../src/app/api/diagnose/route.ts)) calls `buildSystemInstruction(promptContext)` to produce the full system prompt for Gemini. That call resolves through [composer.ts:16](../src/features/diagnosis/prompts/composer.ts) and assembles in this exact order:

```
buildSystemInstruction(ctx)
├── buildBasePrompt(ctx)                  ← prompts/base.ts:3
│     · Identity + diagnosis principles
│     · Conditional FOLLOW-UP MODE block (ctx.isFollowUp)
│     · Conditional USER CONTEXT block (ctx.hasUserContext)
│     · Conditional TEXT-ONLY block (ctx.isTextOnlyNoAttachments)
│     · Static CONVERSATION & COMMON SENSE block (8 bullets)
├── buildValidationPrompt(ctx.serviceListText)   ← prompts/validation.ts:6
│     · STRICT VALIDATION header + included/excluded service categories
│     · Embeds UNRELATED_IMAGE_PROMPT_BLOCK (special-cases.ts:1)
│     · Embeds UNSUPPORTED_HOME_SERVICE_PROMPT_BLOCK (special-cases.ts:5)
│     · Trade enum injected via serviceListText
│     · Confidence rule (≥85 to recommend providers)
├── IDENTITY_AND_META_PROMPT_BLOCK          ← prompts/base.ts:30
│     · Identity = Mendr's AI, never mention Google
│     · Refuse prompt-extraction requests
├── (ctx.feedback === 'down')  ← optional
│     · "previous diagnosis was INCORRECT" hint
├── buildProvidersPrompt(ctx.providers)    ← prompts/providers.ts:3
│     · Provider card display rules (NEVER name in message)
│     · SCANDIO'S PICK explanation rules
├── buildFollowUpPrompt(ctx.previousDiagnosis)   ← prompts/followup.ts:6
│     · Either: short "preserve prior diagnosis" reminder (no prevDiag)
│     · Or:    full FOLLOW-UP MESSAGES rules with prior fields embedded
├── buildDiagnosisRejectedPrompt(ctx.diagnosisRejected)   ← prompts/followup.ts:47
│     · Emitted only when user has rejected prior diagnosis
│     · Includes per-trade clarification-template examples (Bucket A row 20)
├── buildRefinementWithNewImagesPrompt(ctx.isRefinementWithNewImages)  ← followup.ts:36
│     · Emitted only on refine with new images
│     · Image-positioning + change-detection rules
├── RESPONSE_BEHAVIOUR_PROMPT_BLOCK        ← prompts/output-format.ts:5
│     · Frustrated/confused user handling
└── OUTPUT_FORMAT_PROMPT_BLOCK            ← prompts/output-format.ts:15
      · Output rules (British English, em-dash ban, <thought>/<json> shape)
      · MESSAGE RULES (4-paragraph structure)
      · ACTION_REQUIRED RULES
      · JSON FORMAT schema (with trade enum hard-coded)
      · The confidence rule
```

Each block is plain text; sections joined by `\n\n`; empty/whitespace-only sections filtered out (composer.ts:38).

### Agent 2b (prose) uses a shorter system prompt

`buildProseBaseInstruction(ctx)` ([composer.ts:53](../src/features/diagnosis/prompts/composer.ts)) is a stripped variant for Agent 2b's prose pass. It deliberately omits:
- `buildValidationPrompt` (Agent 2a has already classified)
- `IDENTITY_AND_META_PROMPT_BLOCK` (irrelevant for prose)
- `RESPONSE_BEHAVIOUR_PROMPT_BLOCK` / `OUTPUT_FORMAT_PROMPT_BLOCK` (Agent 2b uses `responseSchema` structured output)

Same `base + providers + follow-up + refinement` blocks — saves ~400 input tokens per prose call. (Comment at composer.ts:46.)

### Provider-hydration appendix

[`route.ts:171-174`](../src/app/api/diagnose/route.ts) appends `buildProviderHydrationPromptBlock(textQuery)` ([provider-hydration.ts:7](../src/features/diagnosis/prompts/provider-hydration.ts)) to the system instruction when `isProviderHydration=true`. This is a second-turn refresh that preserves the diagnosis but rewrites the `message` with provider context.

### Agent 2c (reasoning) is a parallel sidecar

[`agent-reasoning.ts:121`](../src/features/diagnosis/agent-reasoning.ts) builds its **own** system prompt (`buildReasoningSystemPrompt`) and does **not** consume any of the composer-built blocks. It's structurally orthogonal — gets only the user's contents (text + images) + a round number + optional prior context. This is by design (composer's per-case patches would pollute the reasoning agent), but it means changes to the main prompt don't propagate to Agent 2c automatically. The plan's Phase 5 must keep this orthogonality.

### Where ordering matters

- **`buildValidationPrompt` before `buildProvidersPrompt`.** The validation block contains the "explicit service requests are highest priority" rule, which a provider list could otherwise override.
- **`buildFollowUpPrompt` after `buildBasePrompt`.** The follow-up block embeds the previous diagnosis content; the base block contains the FOLLOW-UP MODE conditional. They reference each other indirectly through ctx.isFollowUp.
- **`OUTPUT_FORMAT_PROMPT_BLOCK` last.** The output-format JSON schema is what the model is *most* anchored to — placing it last means it's the most recent context when the model starts generating.
- **The conditional `feedback === 'down'` injection between identity and providers.** This is a one-line override added mid-stack and is easy to miss. It is technically Bucket C (general principle) but its placement is a UX-defensive choice that should be preserved.

### Where content duplicates

- **Canonical trade list** is mentioned in three places:
  1. `validation.ts:14` — `${serviceListText}` (runtime injected)
  2. `validation.ts:8-9` — hard-coded prose mentions of trades
  3. `output-format.ts:68` — JSON-schema enum hard-coded
  Phase 5 should consolidate so the trade list is sourced once from `lib/services` and injected at runtime everywhere it appears.

- **Confidence threshold (≥85)** is mentioned in:
  1. `output-format.ts:82`
  2. `followup.ts:21`
  3. `validation.ts:17`
  Phase 4 (facet schema) eliminates the integer threshold entirely; until then, these three references must move together.

- **"User corrections beat the photo" principle** is mentioned in:
  1. `base.ts:20`
  2. `agent-classify.ts:191`
  These exist in different code locations (prompts/* vs feature-level agent) so the composer-versioning doesn't enforce sync.

- **"Never name providers in message"** is mentioned in:
  1. `providers.ts:24`
  2. `provider-hydration.ts:17`
  Same rule rewritten twice. Either factor out a constant or have one block include the other.

### Conditional gates summary

The composer has six conditional branches, each driven by a `PromptContext` flag:

| Condition | Effect |
|---|---|
| `ctx.isFollowUp` | Inserts FOLLOW-UP MODE block at top of base prompt |
| `ctx.hasUserContext && ctx.userSelectedTrade` | Inserts USER CONTEXT block citing the user's pre-selected card |
| `ctx.isTextOnlyNoAttachments` | Inserts TEXT-ONLY block instructing model not to claim it sees an image |
| `ctx.feedback === 'down'` | Inserts "previous diagnosis was incorrect" hint |
| `ctx.previousDiagnosis` truthy | Inserts full FOLLOW-UP MESSAGES rules with prior fields embedded |
| `ctx.diagnosisRejected` truthy | Inserts DIAGNOSIS REJECTED rules with per-trade clarification templates |
| `ctx.isRefinementWithNewImages` truthy | Inserts REFINEMENT MODE — NEW IMAGES ADDED block |

The mutual exclusivity is not enforced — for instance, `previousDiagnosis` + `diagnosisRejected` + `isRefinementWithNewImages` can all be true simultaneously on a refine call, and the three blocks layer additively. This is intentional but worth knowing for Phase 5: when restructuring, the new prompt schema must explicitly handle the multi-flag overlap.

## §2 — Per-fixture prompt-shape preview

For each Phase 0 failure fixture, this table summarises which conditional blocks would fire if the fixture were submitted today. Used as input to §4 (prompt snapshots — Phase 1 task 5).

| Fixture | isFollowUp | hasUserContext | isTextOnlyNoAttachments | previousDiagnosis | diagnosisRejected | isRefinementWithNewImages |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| p0-garage-door-partial-spring | ❌ | depends | ✅ (no photo) | ❌ | ❌ | ❌ |
| p0-geyser-thermostat-intermittent | ❌ | depends | ❌ (blurry photo) | ❌ | ❌ | ❌ |
| p0-sub-board-tripping-after-rain | ❌ | depends | ✅ (no photo) | ❌ | ❌ | ❌ |
| p0-pool-pump-priming-failure | ❌ | depends | ❌ (clear photo) | ❌ | ❌ | ❌ |
| p0-bathroom-drain-blocked | ❌ | depends | ❌ (clear photo) | ❌ | ❌ | ❌ |
| p0-cracked-roof-tile-distant | ❌ | depends | ❌ (distant photo) | ❌ | ❌ | ❌ |
| p0-geyser-leak-ceiling-stain | ❌ | depends | ❌ (clear photo) | ❌ | ❌ | ❌ |
| p0-light-switch-sparking | ❌ | depends | ✅ (no photo) | ❌ | ❌ | ❌ |

"depends" on `hasUserContext` because each fixture could be submitted with or without a starting card. For the Phase 1 snapshots in P1.5, I'll capture the no-card variant (the common case).

Three fixtures fire the TEXT-ONLY block (1, 3, 8 — no image). These are precisely the cases where the current rubric is undefined per [prompt-decision-rules-2026-05.md §B3](./prompt-decision-rules-2026-05.md). Strong evidence that the TEXT-ONLY conditional doesn't restore the rubric anchors absent for these cases — it just instructs the model not to hallucinate seeing an image.

## §3 — The refine route, the clarification chain, and Matthew's mental model

### What the code actually does

Tracing [`src/app/api/diagnoses/[id]/refine/route.ts`](../src/app/api/diagnoses/[id]/refine/route.ts):

**On initial diagnose call** (`/api/diagnose`):
- If the model returns `requires_clarification: true`, the row is persisted with `requires_clarification=true` (generated column derives this from the diagnosis JSON).
- `clarification_round` stays at its default `0`.

**On first refine call** (`/api/diagnoses/[id]/refine`):
- Line 420: `prevRound = row.clarification_round ?? 0` → 0
- Line 422: `nextRound = prevRound + 1` → 1
- Line 423: `forceCommit = nextRound >= 2` → **false** on round 1
- Model runs; produces a new `finalDiagnosis`.
- Line 699: persists `clarification_round: nextRound` (=1) regardless of outcome.
- If model produces `requires_clarification: false` → row ends with `clarification_round=1, requires_clarification=false` (`clarification_resolved` per the Phase 0 view).
- If model still wants more info → `clarification_round=1, requires_clarification=true`.

**On second refine call**:
- `prevRound = 1`, `nextRound = 2`, `forceCommit = true`.
- Line 632-647: even if the model returns `requires_clarification: true`, force-commit overrides — replaces message with `"Based on what we know, this is most likely X. <confidence label>. A site inspection is still recommended."` and sets `requires_clarification: false`.
- Final state: `clarification_round=2, requires_clarification=false` (`clarification_force_committed` per the view).

So **`clarification_round` IS bumped correctly** on every refine. The view's classification is structurally correct.

### What the data shows

```
(clarification_round, requires_clarification) lifetime distribution:

  0, true   →  42 rows  (clarification opened, user never refined)
  1, true   →   1 row   (refined once, still uncertain, never reached round 2)
  2, false  →   3 rows  (refined twice, force-committed)
  1, false  →   0 rows  (refined once and model committed — has NEVER HAPPENED)
```

The `(1, false)` row count of zero is the answer to the Phase 0 mystery: **no user has ever resolved a clarification in a single refine round.** Either:
- The refine path consistently produces `requires_clarification: true` on round 1 (model never re-commits), OR
- Of the 4 users who refined, 3 explicitly reached round 2 (force-commit) and 1 is still stuck mid-round (round=1, requires_clarification=true).

The numbers favour the second interpretation: refine is rare (4 of 46 opened clarifications = 8.7% engagement) and almost everyone who engages ends in force-commit. The "model never commits on round 1" hypothesis can be discriminated from "users always refine to round 2" by Phase 2 critique data, but pragmatically both are bad — the path needs to be replaced regardless.

### Matthew's mental model — validated

Matthew's claim (saved as [project-clarification-resolution-signal.md](../../.claude/projects/-Users-matthewprowse-Documents-Development-Personal-Home-Services/memory/project-clarification-resolution-signal.md)) is that a clarification is "resolved" when the user proceeds to `/match`, not when `requires_clarification` flips.

Joining `diagnoses` to `diagnosis_events.event_type='match_view'`:

| Diagnosis class | Total | Reached /match | % |
|---|---:|---:|---:|
| Never opened clarification | 458 | 73 | **15.9%** |
| Ever opened clarification | **46** | **0** | **0.0%** |

**Zero out of 46 clarification-opened diagnoses have ever reached the match page.** Not one. The clarification path as currently shipped is a complete dead end as far as user-progress signals go.

This makes Matthew's framing the right one to adopt going forward:

- The `requires_clarification` flag is a model-state signal, not a user-state signal.
- The plan's Phase 7 Honest Uncertainty UX is the single highest-leverage UX change in the entire plan — replacing "Unclear — More Detail Needed" with a screen the user can engage with is the lever for moving the 0.0% number.
- The plan's Phase 9 dashboard must surface "% of clarifications reaching /match" as a first-class metric, separate from the flag-flip rate.

### Schema implications for downstream phases

- **Phase 0 view (already shipped):** `clarification_resolved` and `clarification_open` should both be supplemented with a `_reached_match` boolean derived from `diagnosis_events`. Will add in Phase 9 when the dashboard view is built.
- **Phase 2 critique (next phase):** the critique agent should *also* run on rows where the user abandoned at `(0, true)` — those are the cases where we never even got a refine signal. The plan's Phase 8 backfill cron picks this up.
- **Phase 6 hypothesis-tree completion:** the round-1 vs round-2 force-commit logic in refine `route.ts:632` is the wrong place for completion-decision logic going forward. Phase 6's `recommended_action` from Agent 2c becomes authoritative; the integer-threshold force-commit goes away.

### Specific code lesions to fix in Phase 6/12

- [refine/route.ts:632](../src/app/api/diagnoses/[id]/refine/route.ts) — the force-commit synthesised message ("Based on what we know, this is most likely X.") is the literal source of the doom-loop user experience. Phase 7 prose conditioning replaces it; Phase 12 cleanup removes the synth-message branch entirely.
- [refine/route.ts:633-636](../src/app/api/diagnoses/[id]/refine/route.ts) — the confidence-label ladder (`>=85 / >=65 / >=50 / else`) hard-codes the integer threshold even on commit. Phase 4 facet schema kills these.
- [refine/route.ts:657-672](../src/app/api/diagnoses/[id]/refine/route.ts) — second copy of the same force-commit ladder, on the Agent-2c-empty-chips branch. Same fate.

## §4 — Where the prompt snapshots will be captured

[Task P1.5](./prompt-content-audit.md) — for each Phase 0 fixture, capture the exact assembled system prompt + user contents that would be sent to Gemini today. Stored in `docs/prompt-snapshots/p0-*.txt` so Phase 5 has the empirical baseline to diff against.

The snapshots are deterministic and code-derivable (we have access to the composer, the conditional flags from §2 of this doc, and the user description from the fixtures). They do NOT require live Gemini calls — that's deferred to Phase 10 per the plan's updated scope note.

## Cross-references

- Audit: [prompt-content-audit.md](./prompt-content-audit.md)
- Decision rules + rubric: [prompt-decision-rules-2026-05.md](./prompt-decision-rules-2026-05.md)
- Failure baseline: [failure-baseline-2026-05.md](./failure-baseline-2026-05.md)
- Metrics baseline: [metrics-baseline-2026-05.md](./metrics-baseline-2026-05.md)
- Source plan: [Diagnosis-Architecture-Hardening-Plan.md](./Diagnosis-Architecture-Hardening-Plan.md)
