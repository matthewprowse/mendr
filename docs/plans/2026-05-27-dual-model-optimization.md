# Plan — Independent optimization of 2.5 + 3.5, hybrid routing, background-agent improvement loop

**Status:** plan only — no code changes yet
**Trigger:** user request 2026-05-27 to honestly assess whether 2.5 is "done", whether 3.5's current results reflect its capability ceiling, and whether a hybrid architecture could combine both
**Owner:** Matthew Prowse

---

## Part 0 — Research findings (what each model actually is)

Before judging "is 2.5 done" or "can we get more out of 3.5", we need to know what each model is genuinely good at. The picture from Google's release notes and independent benchmarks is meaningfully different from how we've been treating them.

### Gemini 2.5 Flash (current production)

- **Hybrid reasoning with *controllable* thinking budget.** Not a "thinking-off" model — it has thinking, but we set the budget per call (currently `thinkingBudget: 1024` on the prose agent; 0/off on classify).
- Native structured output + responseSchema enforcement is mature
- 1M context, 65K max output
- Specifically tuned for "reasoning, coding, mathematics, and scientific tasks"
- **Known weakness: "very verbose" output.** Aligns with what we've observed.
- Has been our production model for ~2 months of iterative tuning

### Gemini 3.5 Flash (released May 19, 2026)

- **Dynamic thinking is ON BY DEFAULT.** Four levels — minimal/low/medium/high — and the model auto-allocates compute per task.
- **"Thought preservation" across turns.** This is huge for multi-step pipelines we haven't exploited at all.
- **Strongest agentic + coding model in the Flash tier.** Outperforms 3.1 Pro on Terminal-Bench (76.2%), GDPval (1656 Elo), MCP Atlas (83.6%).
- 84.2% on CharXiv Reasoning — multimodal understanding lead.
- 289 tokens/second generation speed, 4× faster than other frontier models.
- Knowledge cutoff January 2026 (3 months newer than 2.5).
- 1M context, 65K max output (same as 2.5).
- Pricing confirmed: $1.50 in / $9.00 out / $0.15 cached per 1M tokens.

### What this means for our pipeline

Our v3.5 prompts so far have been **patches on top of v2.5** — we tweaked the commit rule, bumped maxOutputTokens, added thinkingConfig. None of that **plays to 3.5's actual strengths.** A 3.5-native prompt would:

- Let dynamic thinking run high on hard cases (we currently set thinkingBudget=1024 which CAPS it)
- Use multi-step agentic phrasing ("first identify the equipment, then enumerate possible failures, then choose the most likely") that 3.5 can natively execute
- Lean into self-correction ("if your initial confidence is below 70, run a second pass to find what you might have missed")
- Use the longer output budget (3.5 supports up to 65K tokens vs the 4K we cap prose at)

We've barely scratched 3.5's capability surface.

### Industry pattern: hybrid model routing

Independent research published in 2026 finds that **70–80% of production LLM queries never need a frontier model**, and a properly-routed hybrid can hit frontier-quality output using only 20% of the frontier-model tokens. Three routing strategies dominate:

- **Task-complexity scoring** — a lightweight classifier decides up-front
- **Confidence cascading** — try cheap model first; escalate when confidence < threshold
- **Step-level routing** — route each sub-step independently based on its difficulty

This is exactly the user's hybrid intuition. The literature backs it.

---

## Part 1 — Honest assessment: is 2.5 "done"?

After ~2 months of iteration, 2.5 with v2.5 prompts is at 13/13 (100%) routing on our 4-test eval. So in one sense, yes, the work was successful. But the eval is small and the model has real, observable weaknesses that I think you'd notice on a larger labeled set. Here's my candid breakdown:

### What's genuinely good (don't touch)

- **Routing accuracy** — sid + trade selection is reliable when the equipment is clearly visible
- **Confidence calibration on the high end** — when 2.5 returns 95+, it's almost always right
- **Title stability** — repeat runs produce near-identical titles
- **Schema adherence** — never returns malformed JSON, never bails to none_unmapped without strong signal
- **Cost** — at $0.0101/diagnosis we have huge headroom

### What's still suboptimal (likely improvable)

| Area | Symptom | Why I think it can move | Estimated gain |
|------|---------|-------------------------|----------------|
| **Verbose prose** | Messages run 4-6 sentences when 2-3 would do | Google explicitly calls out "very verbose" as 2.5's known weakness; tightening the prose prompt's "concision" rules can move this | Medium (UX win, ~15% token reduction) |
| **Confidence on partial evidence** | Returns 65 on "geyser is leaking" + 3 photos — the rich evidence should push to 80+ | Confidence-band copy in classify is conservative; recalibrating with explicit examples per band could shift mean confidence up | Medium |
| **Per-image observation drift** | image_descriptions sometimes repeats observations across photos | Already added the "must be visually distinct" rule but the model occasionally ignores it; reformulating as a structured "what's unique here?" question per image | Small-medium |
| **Multi-fault diagnosis** | When two issues are present, the model picks one and underplays the other | We don't have a "multi-fault" path — would need a new agent or schema field | Medium-large |
| **Clarification question quality** | Generic chips like "It is not turning on" — not specific enough to discriminate | Agent 2c hypothesis-driven chips improved this; can go further with per-failure-mode chip templates | Small |
| **Caching of prose prompt** | Prose system prompt is dynamic (classification injected); can't be cached today | Refactor to split static (taxonomy, symmetry, cause-hierarchy blocks) from dynamic (classification result) — would unlock 60% of prose input cost reduction on a cached path | Cost-only, ~30% reduction |

### What's a hard ceiling

Some things can't be fixed in 2.5 because they're inherent to its architecture:

- **Multi-step reasoning** — 2.5 can't truly chain "identify equipment → consider failure modes → rule out via image evidence → commit". It does this in one shot with thinking budget, which has limits.
- **Self-correction** — 2.5 doesn't natively re-evaluate its first response.
- **Novel equipment recognition** — when the photo shows something not in our taxonomy, 2.5 can't extrapolate well.

### My honest take on 2.5

**There's meaningful room left — probably 3-6 more months of polish to wring out — but the gains diminish.** Each improvement is smaller than the last. The "geyser → 80+ confidence on rich evidence" win might take 2-3 weeks of iteration. The "multi-fault detection" requires a real architectural change.

**You're past 80% of what 2.5 can deliver.** The next 20% is real work but real returns; just don't expect 2-month gains anymore.

---

## Part 2 — How 3.5 should actually be tuned (independently from 2.5)

Our current v3.5 prompts are v2.5 prompts with three patches: commit rule rewording, maxOutputTokens bump, thinkingConfig:1024. That's not optimization — that's port-and-debug. A proper 3.5-native approach is fundamentally different.

### 3.5's real strengths to lean into

1. **Dynamic thinking levels.** We're capping at 1024 budget. 3.5 can autonomously decide it needs more on hard cases. **Remove the explicit cap; pass `thinkingBudget: -1` (auto) or set the high tier on diagnostically ambiguous photos.**
2. **Agentic multi-step planning.** Reframe the diagnosis prompt as: "Step 1: identify equipment. Step 2: list 2-3 possible failure modes. Step 3: for each, what visual evidence supports/refutes? Step 4: commit." Let it execute the plan natively rather than us forcing single-shot.
3. **Self-correction.** Add a final step: "Now reconsider: is there any image evidence you initially dismissed that contradicts your diagnosis? If yes, lower confidence to ≤70 and explain."
4. **Larger output budget.** Currently capped at 2K (classify) / 4K (prose). 3.5 supports 65K. Going to 8K-16K on prose lets it write more thorough reasoning sections (we can post-process to extract the user-facing summary).
5. **Thought preservation across turns.** On the refine path, 3.5 can natively maintain the diagnostic chain across rounds. We currently re-feed everything; 3.5 could keep its reasoning state warm.

### New v3.5 prompt architecture (proposed)

Replace the current single-shot classify+prose split with a structured multi-step protocol that mirrors how a contractor actually diagnoses:

```
v3.5 Diagnosis Protocol (new):

  Stage A — Equipment Identification (thinking: low)
    "What equipment is shown? Be specific."
    Output: equipment_type, confidence, source_image

  Stage B — Failure Mode Enumeration (thinking: medium)
    "List 2-4 plausible failure modes for this equipment given the visible evidence."
    Output: candidate_failure_modes[] with per-mode evidence_for / evidence_against

  Stage C — Adjudication (thinking: high)
    "Choose the most likely failure mode. Justify by citing specific images and ruling out alternatives."
    Output: primary_diagnosis, confidence, ruled_out_alternatives[]

  Stage D — Self-correction (thinking: low)
    "Reconsider: is there evidence you under-weighted? Adjust if so."
    Output: final_diagnosis, final_confidence, revision_notes

  Stage E — Output formatting
    Map the protocol's structured output to our existing schema fields.
```

This could either be:
- **(a) One prompt with the protocol as a chain-of-thought instruction** — relies on 3.5's native thinking
- **(b) Four separate model calls** — more expensive but observable per-step
- **(c) Hybrid: one call, but with structured output that has the protocol stages as schema fields** — cleanest

I'd start with (c). Schema would have `equipment_id`, `failure_candidates`, `adjudication_notes`, `final_diagnosis`. The model fills them in order; we get visibility into the reasoning steps.

### Expected impact

If we actually do this, my estimate (no eval yet to back it up):
- Diagnostic accuracy on complex cases: probably +10-15% over current v3.5
- Confidence calibration: 3.5 should commit at 88-95% instead of 75-85% on partial evidence
- Title quality: better because the multi-step process forces specificity
- Token cost: probably +20-30% on prose (longer output) — needs eval
- Time per call: probably +5-10s due to deeper thinking

This puts 3.5 closer to its actual capability ceiling. It's an honest comparison.

### What to keep from current v3.5

- maxOutputTokens 2000 on classify (still needed for thinking budget)
- thinkingConfig on classify (still needed for vision grounding)
- Context caching of system prompt (the big cost win)
- Lower clarify threshold (70 not 85)

---

## Part 3 — Hybrid architecture proposal

You're right that this is worth designing properly. Here's a concrete architecture.

### Pipeline today (single-model)

```
/api/diagnose
  → Agent 2a (classify)        — 2.5 OR 3.5 (env-controlled)
  → Agent 2b (prose)           — same as above
  → Agent 2c (reasoning, opt)  — same as above
  → Agent 3 (critique, async)  — always 2.5
```

### Proposed hybrid pipeline

```
/api/diagnose
  → Stage 1: Fast Screener     — 2.5 Flash
      • Input:  images + user text
      • Output: equipment_id, subcategory_id, trade, confidence, 
                image_quality_score, equipment_visibility_score,
                hard_case_flag
      • Cost:   ~$0.003 per call
      • Time:   ~5s

  → ROUTER (deterministic, no LLM)
      • If hard_case_flag=false AND confidence>=90: skip Stage 2, build prose from template — 2.5
      • If confidence 70-89 OR hard_case_flag=true: go to Stage 2 — 3.5
      • If confidence <70: fall to clarification flow (existing)

  → Stage 2: Deep Diagnostician — 3.5 Flash (only on routed cases)
      • Input:  Stage 1 output + images + user text
      • Output: full diagnosis prose, structured_clarification, image_observations
      • Cost:   ~$0.030 per call (with cached system prompt)
      • Time:   ~15-20s

  → Stage 3: Critique           — 2.5 Flash (always)
```

### Decision criteria for routing

The "hard case" flag from Stage 1 would be set when ANY of:
- Multi-fault evidence (two distinct issues visible)
- Asymmetry detected (likely upstream-cause case)
- Equipment not perfectly matching a taxonomy row
- User text contradicts visual interpretation
- Image quality low but equipment visible
- Confidence 70-89 (sweet spot for upgrading)

These are cheap signals for 2.5 to emit alongside its main output.

### Cost projection for hybrid

Assume distribution:
- 60% of cases → Stage 1 commits at conf >= 90 → use 2.5 prose (template-based)
- 30% of cases → routed to 3.5 for deep diagnosis
- 10% of cases → fall to clarification

Per-100-diagnosis costs:
| Path | Count | Per-call | Subtotal |
|------|-------|----------|----------|
| 2.5 commit-only | 60 | $0.010 | $0.60 |
| Hybrid (2.5 screen + 3.5 deep) | 30 | $0.033 | $0.99 |
| Clarification cycle | 10 | $0.015 | $0.15 |
| **Total** | **100** | | **$1.74** |

vs current production (pure 2.5): $1.01 per 100
vs pure 3.5: $4.90 per 100

So hybrid lands at **~1.7× the cost of pure 2.5** while applying 3.5's reasoning to the cases that actually need it. If 3.5's deep-diagnostic quality lifts accuracy on the hard 30% by even 10pp, that's a strong return.

### Implementation approach

1. Add `image_quality_score`, `equipment_visibility_score`, `hard_case_flag` to the classification schema
2. Build a deterministic router in `pipeline-runner.ts` that branches based on Stage 1 output
3. Wire the existing prose agent to accept a `model_tier: '2.5'|'3.5'` param that drives both model selection and prompt variant
4. The 2.5-template path uses much shorter prose generation (the model just fills in templated slots — taxonomy_label, suggested_action, expected_callout_cost) — much cheaper
5. The 3.5 path uses the multi-step protocol from Part 2

This is a meaningful refactor — probably 2 weeks of focused work.

### Risk: pipeline complexity

The hybrid pipeline has more failure modes than the single-model one. We'd need:
- Telemetry on routing decisions (which path took, why)
- Fallback when Stage 2 fails (run a degraded Stage 1-only output)
- Eval coverage on the routing logic itself

---

## Part 4 — Background sub-agents for continuous improvement

You asked specifically for "agents that can keep iterating in the background." The Claude Code harness has `CronCreate` and `schedule` skills that let us spawn long-running improvement loops. Here's a concrete design.

### What each background agent does

Three parallel improvement tracks:

**Track A — "2.5 Polisher"**
- Goal: tighten v2.5 prompts and sampling without breaking accuracy
- Schedule: nightly at 02:00
- Procedure each run:
  1. Branch off main: `2-5-polisher-YYYYMMDD`
  2. Run baseline eval on current main
  3. Pick one targeted improvement from a backlog (verbose prose, confidence calibration, image-description distinctness, etc.)
  4. Apply the change to v2.5 prompt files
  5. Run eval matrix (smoke) on the change
  6. If score >= baseline, open a PR for review (do NOT merge automatically)
  7. If score < baseline, discard the branch
- Output: a queue of pre-tested improvement PRs you review in the morning

**Track B — "3.5 Architect"**
- Goal: progressively refactor v3.5 to play to 3.5's actual strengths
- Schedule: every other night at 03:00
- Procedure: same shape as Track A but on v3.5 files
- First few runs would land the Part 2 changes (multi-step protocol, dynamic thinking, larger output budget)

**Track C — "Hybrid Pipeline Builder"**
- Goal: incrementally implement the hybrid architecture from Part 3
- Schedule: weekly (Sundays)
- Procedure: more complex — each run picks one piece of the hybrid plan and lands it as a feature-flagged PR

### How to give them autonomy without losing control

Each agent operates under these rules:
- **Branch only.** Never commit to main, never merge.
- **PR-first.** Always opens a PR with: the change diff, the eval delta, the hypothesis being tested, links to the divergence log.
- **Eval gate.** PRs that regress the matrix score are auto-closed.
- **Rate limit.** Max one PR per agent per night.
- **Token budget.** Hard limit on Gemini spend per agent run (so a buggy iteration can't burn $500).

### Implementation primitives in the harness

- `mcp__scheduled-tasks__create_scheduled_task` exists in the deferred tool list — that's the cron primitive
- Each agent is a self-contained prompt that re-enters via the schedule
- The agent has full code access during its run, then exits

### What to build first

I'd do it in phases:
- **Phase 1 (one session):** Set up the eval-running infrastructure as a callable command (`npm run eval:overnight` that produces a JSON delta report and posts a PR if score improved)
- **Phase 2 (one session):** Wire Track A as the first scheduled agent (the "easy" one — small tweaks to existing prompts)
- **Phase 3:** Add Track B (3.5 architect) once Track A is producing PRs you trust
- **Phase 4:** Track C (hybrid builder) — this one needs the most scaffolding

---

## Part 5 — Folding in your expanded labeled test set

You mentioned you're finding more labeled examples. The current eval has 4 fixtures. To make the comparison meaningful, we want 20–50 labeled cases covering:

### Coverage we should aim for

- Geyser failures (have 2; add 5 more variants: element failure, thermostat, valve, leak under pressure, no hot water)
- Garage doors (have 2; add 5 more: motor failure, cable snap, off-track, bent panel, sensor mis-alignment)
- Gate motors (have 0; add 4: motor stuck, remote dead, sensor fault, alignment)
- Plumbing leaks (have 0; add 6: burst pipe, tap, toilet, drain, joint, slow drip)
- Electrical (have 0; add 6: tripping breaker, dead socket, lighting circuit, DB board, earth leakage, RCD trip)
- Pool pumps (have 0; add 3)
- Damp / waterproofing (have 0; add 4)
- "Unsupported" or "rejected" cases (have 0; add 4: pet photo, food, screenshot, cosmetic-only)

That's ~40 cases. Each needs:
- 1-4 photos in `~/Downloads/`
- A short user text
- An expected `subcategory_id`
- An expected `trade`
- An expected `commit` boolean
- Optional: an expected title keyword

### How to fold them in

The current eval-live-tests script just takes a fixture list. Adding cases is editing one array. We'd want:
- A per-category breakdown in the matrix output (so you can see "we're 100% on garage, 60% on plumbing")
- A "hard case" flag on fixtures where the model is expected to ask for clarification
- A "subcategory coverage" report — which taxonomy rows have how many test cases

I can add the per-category aggregation to `eval-compare.ts` as a small Session 4 task.

---

## Part 6 — Phased roadmap

If you green-light this plan, the sequencing I'd recommend:

### Phase 1 — Foundation (1 session, ~2-3 hours)
- **You:** finish labeling the new test set, drop photos in `~/Downloads/` with consistent naming
- **Me:** extend the eval matrix to support 20+ fixtures, add per-category aggregation, fold in your new cases. Run the full matrix on current state — establish the new baseline.

### Phase 2 — 3.5 reimagined (2 sessions, ~4-6 hours)
- Implement Part 2: the multi-step diagnostic protocol as v3.5 prose
- Update v3.5 classifier with confidence calibration tuned to the new protocol
- Run matrix, measure delta vs current v3.5

### Phase 3 — Hybrid scaffolding (3 sessions)
- Add the routing layer in pipeline-runner.ts
- Add Stage-1 schema extensions (hard_case_flag etc.)
- Build the template-based prose path for high-confidence 2.5 commits
- Run matrix in "hybrid mode" — measure cost + quality

### Phase 4 — Background agents (2 sessions)
- Build `npm run eval:overnight` reporter + auto-PR opener
- Configure Track A (2.5 polisher) as the first scheduled agent
- Monitor for a week before adding Track B

### Phase 5 — Continuous iteration (open-ended)
- Tracks A and B running nightly
- You review their PRs over coffee, merge what's good
- Eval matrix runs on every PR; regressions auto-closed
- Monthly: review the divergence log, decide where to keep investing

### Total estimate

About 2-3 weeks of focused work to land Phases 1–4. Phase 5 is forever — that's the point.

---

## What I'd start with right now if you say go

Just **Phase 1**: extend the eval matrix to accept 20-40 fixtures, add per-category aggregation, run the new baseline. That gives both of us a real surface to optimize against, and it directly enables the comparison you actually want — 2.5 vs 3.5 vs hybrid on a labeled set worth caring about.

Phases 2-4 each need a "do you want to commit to this direction?" check-in once Phase 1 gives us data.

---

## Open questions for you

1. Are you comfortable with background agents opening PRs autonomously? (You'd review before merge but it's a workflow shift.)
2. Token budget cap for the background agents — what's reasonable per night? ($5? $20?)
3. The hybrid architecture is the biggest change. Worth doing if (and only if) the expanded eval shows 3.5 outperforms 2.5 on a meaningful slice of cases. Should we gate Phase 3 on that result?
4. Do you want the eval-matrix runs to live in your repo (`tmp/eval-live/` ephemeral) or be committed for diff history?

---

## Sources

- [Google Introduces Gemini 3.5 Flash at I/O 2026 — MarkTechPost](https://www.marktechpost.com/2026/05/20/google-introduces-gemini-3-5-flash-at-i-o-2026-a-faster-and-cheaper-model-for-ai-agents-and-coding/)
- [Gemini 3.5 — Google DeepMind](https://deepmind.google/models/gemini/)
- [Gemini 3.5 Flash Benchmarks, Thinking & API Guide 2026 — DigitalApplied](https://www.digitalapplied.com/blog/gemini-3-5-flash-benchmarks-api-guide)
- [Gemini 2.5 Flash — Artificial Analysis](https://artificialanalysis.ai/models/gemini-2-5-flash)
- [Gemini 2.5: Pushing the Frontier with Advanced Reasoning — arXiv 2507.06261](https://arxiv.org/html/2507.06261v1)
- [Hybrid LLM Architectures — ChatNexus](https://articles.chatnexus.io/knowledge-base/hybrid-llm-architectures-combining-multiple-models/)
- [Multi-Model Routing in LLM Orchestration 2026 — Mindra](https://mindra.co/blog/multi-model-routing-llm-orchestration-2026)
- [Three-Tier LLM Routing — MindStudio](https://www.mindstudio.ai/blog/set-up-ai-model-router-llm-stack-c2610)
- [Confidence-Guided Stepwise Model Routing — arXiv 2511.06190](https://arxiv.org/pdf/2511.06190)
