# Cost comparison — 2.5 Flash vs 3.5 Flash

**Date:** 2026-05-27
**Inputs:**
- Pricing rates from `src/lib/ai/ai-cost-logger.ts` (updated this session)
- Token volume from live eval runs `matrix-2026-05-27T16-30-35-934Z.json` (Cell A) and `matrix-2026-05-27T16-38-39-161Z.json` (Cell D)

## Pricing rates (verified)

| Model | Input ($/1M) | Output ($/1M) | Cached input ($/1M) |
|-------|-------------:|--------------:|--------------------:|
| gemini-2.5-flash | $0.30 | $1.00 | n/a |
| **gemini-3.5-flash** | **$1.50** (5×) | **$9.00** (9×) | $0.15 |

## Per-diagnosis cost (observed token volume × pricing)

| Step | 2.5 tokens (in/out) | 3.5 tokens (in/out) | Cell A USD | Cell D USD | Δ |
|------|--------------------:|--------------------:|-----------:|-----------:|--:|
| Agent 2a (classify) | 10,601 / 207 | 13,648 / 206 | $0.00339 | $0.02233 | +$0.01894 |
| Agent 2b (prose) | 10,701 / 1,132 | 13,584 / 1,296 | $0.00434 | $0.03204 | +$0.02770 |
| Agent 3 (critique, always 2.5) | 6,948 / 291 | 6,948 / 291 | $0.00238 | $0.00238 | 0 |
| **Total** | | | **$0.01010** | **$0.05674** | **+$0.04664** |

**3.5 Flash is 5.62× more expensive per diagnosis.**

## Monthly cost at scale

| Volume / month | 2.5 cost | 3.5 cost | Premium |
|---------------:|---------:|---------:|--------:|
| 1,000 | $10.10 | $56.74 | +$46.64 |
| 5,000 | $50.52 | $283.71 | +$233.18 |
| 10,000 | $101.05 | $567.41 | +$466.36 |
| 50,000 | $505.25 | $2,837.07 | +$2,331.82 |
| 100,000 | $1,010.50 | $5,674.14 | +$4,663.64 |
| 500,000 | $5,052.50 | $28,370.70 | +$23,318.20 |

## Where does the cost come from?

- 3.5 input pricing is **5× more** than 2.5
- 3.5 output pricing is **9× more** than 2.5
- v3.5 prompts are ~27-29% longer (the additions for commit-rule clarity + worked example)
- 3.5 output token count is roughly equivalent to 2.5 — extended thinking happens off-meter for output
- Critique always runs on 2.5 (separate `GEMINI_CRITIQUE_MODEL` env). If critique also moved to 3.5, add ~$0.011 per diagnosis (~20% more on 3.5 total)

## 4-test results from this run

### Cell A (2.5 Flash + v2.5 prompts)
| Test | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|------|--------|
| geyser-full-cues | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 98 | ✓ |
| geyser-minimal | Geyser Fault | geyser_fault_plumbing ✓ | Plumbing ✓ | 65 | clarify |
| garage-with-cause | Missing Garage Door Counterbalance Spring | garage_door_fault ✓ | Security ✓ | 98 | ✓ |
| garage-no-text | Counterbalance System | garage_door_fault ✓ | Security ✓ | 98 | clarify |

Score: routing 4/4, commit 2/4.

### Cell D (3.5 Flash + v3.5 prompts)
| Test | Title | Sid | Trade | Conf | Commit |
|------|-------|-----|-------|------|--------|
| geyser-full-cues | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 95 | ✓ |
| geyser-minimal | Corroded Geyser Tank | geyser_fault_plumbing ✓ | Plumbing ✓ | 95 | ✓ |
| garage-with-cause | Missing Tension Spring | garage_door_fault ✓ | Security ✓ | 95 | ✓ |
| garage-no-text | Missing Left Tension Spring | garage_door_fault ✓ | Security ✓ | 95 | ✓ |

Score: routing 4/4, commit 4/4.

## Quality vs cost

| | 2.5 Flash | 3.5 Flash |
|---|-----------|-----------|
| Routing accuracy | 4/4 | 4/4 |
| Commit rate (this run) | 2/4 | 4/4 |
| Mean confidence | 89.75 | 95.0 |
| Cost per diagnosis | $0.0101 | $0.0567 (**5.62× more**) |
| Cost per *committed* diagnosis | $0.0101 / 0.50 commit rate = $0.0202 | $0.0567 / 1.0 = $0.0567 (**2.8×**) |
| Title stability across runs | very high | moderate |
| Latency per /diagnose | ~25-35s | ~35-55s |

**Trade-off in plain terms:** on this run 3.5 Flash committed on all 4 tests and 2.5 only on 2. Even when you adjust for the "cost per committed diagnosis" (rather than cost per call), 3.5 is still ~2.8× more expensive. Across 10,000 monthly diagnoses, that's ~$466 / month extra on 3.5.

**Recommendation:** keep `gemini-2.5-flash` in production. The 5.62× cost premium is hard to justify for a routing/diagnosis task where 2.5 is already at 4/4 accuracy and the only difference is commit rate (a UX softness, not a wrong diagnosis). The v3.5 variant infrastructure stays in place for the day Google reprices 3.5 or a workload emerges where its reasoning genuinely matters.
