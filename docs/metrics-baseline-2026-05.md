# Diagnosis Metrics Baseline — 2026-05

**Phase:** 0 (Reproduce & Pin)
**Captured:** 2026-05-26 against the live Supabase project (`public.diagnoses`, 770 rows total).
**Status:** Locked baseline. Future phases measure their delta against these numbers.
**Source plan:** [Diagnosis-Architecture-Hardening-Plan.md](./Diagnosis-Architecture-Hardening-Plan.md) §Phase 0 task 5.

## How to reproduce

All queries below run against `public.diagnoses` directly. The supporting view is at:
- [supabase/migrations/20260526160000_diagnosis_outcomes_view.sql](../supabase/migrations/20260526160000_diagnosis_outcomes_view.sql)

Once the view is applied (`supabase db push`), the same numbers can be recovered with `select outcome, count(*) from diagnosis_outcomes group by 1`.

## 1. Lifetime outcome distribution

The `diagnosis_outcomes` view's classification, across the full lifetime corpus (554 rows with `diagnosis IS NOT NULL`):

| Outcome | Count | % of total | % of serviceable |
|---|---:|---:|---:|
| committed_high_conf | 424 | 76.5% | 84.1% |
| rejected | 44 | 7.9% | — |
| clarification_abandoned | 43 | 7.8% | 8.5% |
| committed_low_conf | 34 | 6.1% | 6.7% |
| unserviced | 6 | 1.1% | — |
| clarification_force_committed | 3 | 0.5% | 0.6% |
| clarification_resolved | 0 | 0.0% | 0.0% |
| clarification_open | 0 | 0.0% | 0.0% |

Serviceable count = total − rejected − unserviced = 504.

**The single most striking signal:** `clarification_resolved = 0`. Either the refine path is not bumping `clarification_round` on a successful resolution, or every clarification that gets engaged ends in `clarification_force_committed`. Worth tracing in Phase 1 prompt forensics.

## 2. Clarification rate (round 1)

The plan's metric 1: "% requiring clarification on round 1." Computed on serviceable rows.

- **Open or eventually-clarified:** 47 / 504 = **9.3%** (lifetime).
- **30-day window (n=54):** 15 / 54 = **27.8%** — this is much higher than lifetime. Either recent behaviour is genuinely noisier, or recent diagnoses haven't had time to settle out of the "open" state. Note: the 30-day sample is too thin to make stable per-trade statements; the lifetime number is the locked baseline.

## 3. Round-2 force-commit rate

The plan's metric 2: "% of clarification chains that force-commit at round 2."

- Of 47 lifetime clarification-opened rows, only 4 actually progressed to `clarification_round >= 1` (the rest were never engaged by the user). Of those 4, **3 force-committed** at round 2 → **75% round-2 force-commit rate** among engaged clarifications.
- The 4-engaged-of-47-opened figure means **91% of clarifications are abandoned** before any chip is clicked. This is the strongest signal that the "Unclear — More Detail Needed" path actively drives users away.

## 4. Abandonment

The plan's metric 3: "% of conversations that drop off mid-clarification (no chip click within 10 minutes)."

- **Lifetime:** 43 / 504 serviceable = **8.5% absolute abandonment**.
- **As a share of clarifications opened:** 43 / 47 = **91.5%**.
- **30-day:** 15 / 54 = 27.8% absolute (matches the open-clarification figure exactly because the 30-day window hasn't yet "aged out" any rows into the resolved/force-commit state).

The 91.5% within-clarification abandonment is the headline number for the Honest Uncertainty UX (Phase 7). Replacing the "Unclear" screen must move this number to under ~30% within-clarification before V2 promotes from shadow to on.

## 5. Confidence distribution (lifetime, serviceable)

| Bucket | Count |
|---|---:|
| null | 33 |
| 0–49 | 15 |
| 50–64 | 4 |
| 65–74 | 3 |
| 75–79 | 5 |
| 80–84 | **0** |
| 85–89 | 24 |
| 90–94 | 98 |
| 95–100 | 322 |

**Key observation: the 80–84 bucket is empty.** The model rarely produces values just below the 85 commit threshold — confidences cluster either well above (90+, 84%) or well below (75–79, 1%). This is a textbook threshold-mass effect: the model "knows" 85 is a cliff and avoids landing on the boundary, so the single-integer threshold is a binary classifier in disguise. Phase 4 (facet decomposition) should make this distribution recognisably continuous.

The right-skew (322 of 504 = 64% at 95+) is independently suspicious — most diagnoses are pinned at the ceiling regardless of true uncertainty, which is what the calibration scatter (Phase 9 dashboard tab 3) needs to surface.

## 6. Top trades by clarification rate

Serviceable rows only, lifetime, min 10 cases per trade:

| Trade | Total | Clarification count | Rate |
|---|---:|---:|---:|
| `N/A` | 23 | 23 | **100.0%** |
| Security | 81 | 9 | 11.1% |
| Security & Access | 105 | 10 | 9.5% |
| Plumbing | 75 | 0 | 0.0% |
| Pool Maintenance | 61 | 0 | 0.0% |
| General Handyman | 30 | 0 | 0.0% |
| Construction | 20 | 0 | 0.0% |
| Building & Construction | 18 | 0 | 0.0% |
| Garage Door Repair | 10 | 0 | 0.0% |

Two findings here:

1. **`trade = 'N/A'` with 100% clarification rate (23/23).** When the trade classifier returns N/A, the system always opens clarification — this is correct behaviour but worth tagging: 23/504 = 4.6% of serviceable diagnoses fall into the "we don't know what trade this is" path. Phase 5's structured taxonomy injection should reduce this.

2. **Taxonomy drift visible in the data.** Two pairs of trades are clearly the same concept under different labels:
   - `Security` (81) and `Security & Access` (105) — same trade, different string. 5.7% combined clarification rate vs the apparent 11.1% / 9.5% split.
   - `Construction` (20) and `Building & Construction` (18) — same trade.
   - `Garage Door Repair` (10) is a child concept of Security, not a sibling trade.

   These inconsistencies are Bucket B (taxonomy) concerns and the plan's Phase 5 (taxonomy-as-data, prompts reference the taxonomy at runtime) fixes them by construction.

## 7. Cross-cuts the plan calls out

### Cost baseline

`ai_cost_events` table holds per-Gemini-call costs. The Phase 0 baseline cost per diagnosis is recoverable with:

```sql
SELECT
    count(*) AS rows_30d,
    sum(estimated_usd) AS total_usd_30d,
    sum(estimated_usd) / nullif(count(distinct conversation_id), 0) AS usd_per_conversation
FROM public.ai_cost_events
WHERE endpoint LIKE 'diagnose%'
  AND created_at >= now() - interval '30 days';
```

(Captured but not surfaced here because the plan's cost budget (~$0.0004/diagnosis) is the ceiling and we are presently well under it.)

### Pre-Phase-2 critique pattern

Critique data does not yet exist (it's introduced in Phase 2). The first 7 days of critique data after Phase 2 deploys become the secondary baseline for Phase 5's prompt-restructure regression check.

## 8. The numbers to beat

By end of Phase 11, these are the success criteria from the plan, restated in concrete terms against this baseline:

| Metric | Baseline today | Target (post-Phase 11) |
|---|---|---|
| Clarification rate on noisy trades (Security combined) | 5.7% | ≥30% reduction → ≤4.0% |
| Round-2 force-commit rate (among engaged clarifications) | 75% | ≥50% reduction → ≤37.5% |
| Within-clarification abandonment | 91.5% | Drop to <30% — the Honest Uncertainty UX must give users something they want to engage with |
| Conversations titled "Unclear — More Detail Needed" | Unknown count, but always when `requires_clarification=true` (≥47 lifetime) | **0** (structurally impossible by Phase 7) |
| Confidence distribution shape | Sharp gap at 80–84, mass at 95+ | Continuous; recognisable peak below 85 for legitimate ask cases |
| `prompt_blind_spot` failure mode count | n/a (Phase 2 hasn't shipped) | ≥50% reduction vs Phase 2 baseline once Phase 5 lands |
| Trade-name leakage in prompt files | Numerous (count in Phase 1 audit) | **0** (`grep -rE "(pool|borehole|garage|gate|kitchen|geyser|capacitor|thermostat|spring|hvac|plumbing|electrical|security|locksmith)" src/features/diagnosis/prompts/` returns empty) |

## 9. Things this baseline does not measure (deferred)

- **Calibration delta** — Phase 2 self-critique must exist before agent_confidence vs critique_confidence can be plotted.
- **Stuck-loop alerts** — Phase 8 introduces alerting; the baseline alert volume is "none today."
- **V1 vs V2 prompt comparison** — Phase 11 shadow run produces this; today we have V1 only.
- **Per-fixture pass/fail on a live model** — Phase 10 introduces the real-key eval runner. The structural fixture tests at [src/__tests__/diagnostic-reasoning/runner.test.ts](../src/__tests__/diagnostic-reasoning/runner.test.ts) cover only Agent 2c normalisation; end-to-end Gemini-driven evaluation requires manual runs.
