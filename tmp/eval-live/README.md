# Eval reports

This directory is the persistent home for eval driver outputs. Each run
saves both a `.json` (raw data, machine-readable) and a `.md` (readable
side-by-side table).

## File naming

| Pattern | Source | Notes |
|---------|--------|-------|
| `run-<model>-<ts>.json/.md` | `npm run eval:live` | Single-cell run; whatever's in `GEMINI_DIAGNOSIS_MODEL` |
| `matrix-<ts>.json/.md` | `npm run eval:matrix` | All four (model × variant) cells |
| `BASELINE-*.{md,json}` | manually copied | Frozen reference point for diffing tuning iterations |
| `COMPARISON-*.md` | manually written | Human-curated commentary on a comparison |

## How to use the matrix

The eval matrix runs every test against four cells:

| Cell | Model | Prompts |
|------|-------|---------|
| A | gemini-2.5-flash | v2.5 (production baseline) |
| B | gemini-2.5-flash | v3.5 (ablation — do new prompts hurt the old model?) |
| C | gemini-3.5-flash | v2.5 (regression — untuned new model) |
| D | gemini-3.5-flash | v3.5 (the target — fair comparison) |

This requires the dev server running with
`ALLOW_MODEL_OVERRIDE_FROM_REQUEST=1` in `.env.local` (already set).

### Common invocations

```bash
# Full baseline / regression suite
npm run eval:matrix

# Fast iteration — only the diagonal we ship (A + D)
npm run eval:smoke

# Stability: 3 rounds per cell, smooths out non-determinism
npm run eval:matrix -- --rounds 3

# Subset of tests during heavy tuning iterations
npm run eval:matrix -- --tests 1,3 --cells A,D
```

### What "good tuning" looks like

You're trying to bring **Cell D's score up to Cell A's score**. The
matrix lets you separate the effect of the model from the effect of the
prompt:

- If A → B (same model, different prompts) score moves a lot, the
  prompt change matters even on 2.5. That may be desirable (better
  prompts everywhere) or undesirable (you broke 2.5 to help 3.5).
- If C → D score moves a lot, the prompt change works specifically
  for 3.5. This is the win condition.
- If both move in the same direction, the change is a general
  improvement.

## Baseline snapshot

`BASELINE-before-v3.5-tuning.md` is the frozen "before tuning" matrix
captured immediately after Session 2 shipped (v3.5 prompts still
delegating verbatim to v2.5). Diff future matrix runs against this to
see whether your tuning actually moved the score.

When tuning lands a meaningful improvement, save the result as
`BASELINE-<short-name-for-the-change>.md` and update this README so the
"current best" is obvious.

## When to clear out old reports

Reports older than a month are clutter. Keep `BASELINE-*` files
permanently; remove `run-*` and `matrix-*` files older than your last
two tuning iterations.
