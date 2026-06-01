# v3.5 prompt variants

This directory holds prompts tuned for **gemini-3.5-flash** (or any model
whose `model` string starts with `gemini-3`). The dispatcher in
`../prompt-variant.ts` routes here when `variant === 'v3.5'`.

## Status (Session 2 baseline)

**Every builder in this directory currently delegates verbatim to its v2.5
counterpart.** That is intentional. Session 2 ships the *infrastructure* —
the divergence happens in Session 3+ as we iterate against the eval suite.

Until we intentionally diverge, the regression-guard test in
`src/features/diagnosis/__tests__/prompt-variant.test.ts` asserts byte-equality
between v2.5 and v3.5 outputs. That test is the tripwire for accidental drift.

## How to diverge a builder

1. Open the v3.5 file for the agent you're tuning (e.g.
   `classification-system-prompt.ts`).
2. Replace the `return build*_v25(...)` delegation with your own
   implementation. You can copy the v2.5 body as a starting point.
3. Update `prompt-variant.test.ts` — flip the relevant assertion from
   `expect(v35).toBe(v25)` to `expect(v35).not.toBe(v25)` (or remove the
   byte-identity check for that builder; keep the "infrastructure is sound"
   tests).
4. Log your hypothesis in `divergence-log.md` (one line per change).
5. Run the eval suite (`npm run eval:matrix -- --rounds 2`) and check
   whether the v3.5 score improved.

## Sampling params

Sampling params live in `prompt-variant.ts` itself (not split into a separate
file) because they're small enough that splitting them across multiple files
hurts readability more than it helps. To diverge sampling, edit the v3.5
constants in that file.

## Source of truth question

Once a v3.5 builder has diverged, the v2.5 baseline is still maintained
independently — changes intended for both variants need to be applied to
both files. This is the cost of keeping a frozen baseline.
