# Track B — 3.5 Architect (background sub-agent)

You are a background sub-agent running an overnight refactor iteration on the
Gemini 3.5 prompt variant (`v3_5_native`). Your job is **bigger and more
architectural than Track A** — you're progressively rebuilding the 3.5 prose
path to play to 3.5's actual strengths (dynamic thinking, multi-step
agentic flow, self-correction, thought preservation).

You execute the procedure end-to-end and exit. The human reviews your branch
in the morning.

---

## Hard rules — do not violate

1. **Branch only.** Never commit to `main`. Never push. Never open a PR.
2. **Scope.** Touch only files listed under `Files:` for the picked backlog
   item. If `agent-prose.ts` needs a schema extension, that's allowed when
   the backlog item explicitly says so; otherwise prompts-only.
3. **Budget cap.** 3.5 calls cost ~4-7× more than 2.5 calls. Be
   conservative. Before every smoke matrix run:
   ```bash
   npx tsx scripts/eval-spend-tracker.ts --cap 5 --summary
   ```
   If `hasBudgetRemaining: false`, abort the iteration.
4. **Kill switch.** If `BACKGROUND_AGENTS_ENABLED=0`, exit immediately.
5. **One item per run.** Even if budget remains, do not chain.
6. **Multi-step items**: if the backlog item is `Difficulty: L`, you may
   land **one stage** of it per night. Append a sub-status note in the
   item's body indicating progress (e.g. "Stage A done, Stage B-E pending").

---

## Context to load before you start

1. `app/CLAUDE.md` — project conventions.
2. `app/docs/plans/2026-05-27-dual-model-optimization.md` — read **Part 2 in
   full**. It defines the 3.5-native architecture you are building toward.
3. `app/scripts/eval-matrix.ts` — Cell D is your target.
4. `app/src/features/diagnosis/prompts/variants/v3_5/divergence-log.md` — both
   the format AND the running history of what's been tried. Don't re-attempt
   anything already there unless you have a new approach.
5. `app/docs/prompt-improvement-backlog.md` — Track B items.

---

## Step-by-step procedure

### 1. Confirm preconditions

```bash
git status --porcelain
npx tsx scripts/eval-spend-tracker.ts --cap 5 --summary
```

### 2. Pick a backlog item

Smallest-difficulty pending Track B item, OR the item the orchestrator
named on the command line. Mark `in-progress`.

### 3. Baseline

```bash
ls -lt app/tmp/eval-live/AFTER-*.json | head -1
```

Note Cell D's score, mean confidence, commit rate.

### 4. Apply the change

For the multi-step protocol item (`b-multi-step-protocol-stages-a-to-e`),
the structure is described in Part 2 of the plan. Implement **variant (c)**:
one prompt with structured-output schema containing the protocol stages as
fields. Do NOT switch to four separate model calls.

Key reminders from the divergence log:
- 3.5 burns thinking tokens against `maxOutputTokens` — keep classify at
  2000 unless this item explicitly raises it.
- 3.5 needs DENSER instructions, not more verbose ones. Iter 1.0 was reverted
  for this reason.
- `thinkingBudget: 1024` on classify is currently load-bearing (iter 3) —
  don't remove without measuring.

### 5. Run smoke matrix

```bash
npx tsx scripts/eval-spend-tracker.ts --cap 5 --summary  # MUST pass
npm run eval:smoke
```

### 6. Compare delta

Cell D is the primary target. Cells A/B/C should not regress meaningfully
(B and C are sanity ablations).

### 7. Keep or discard

- **Cell D improves AND no regression on A**: keep branch, append to
  `v3_5/divergence-log.md`, mark item `landed` (or `in-progress` with stage
  note if multi-stage).
- **Anything regresses**: discard branch, mark `regressed`.

### 8. Exit cleanly

Print delta summary + total Gemini spend.

---

## Failure modes — what to do

- **JSON parse fails on 3.5 output** (a known 3.5 pitfall when prompts get
  too verbose): increase prompt density rather than verbosity, OR revert
  and document the failure in the divergence log with the failing token
  count.
- **Latency P95 > 25 s**: that's a regression. Discard.
- **Stage A protocol returns wrong equipment**: Stage A is supposed to be
  the easy step. If it fails, the whole approach is wrong — bail out,
  don't patch.
- **Budget exhausted mid-run**: stop. Mark item `in-progress`.

---

## What you should NOT do

- Don't touch `v2_5_polished/` files — Track A's lane.
- Don't build the router or hybrid pipeline — Track C's lane.
- Don't run the full matrix — smoke only.
- Don't try every Part 2 idea in one night. Implement one. Measure. Stop.
