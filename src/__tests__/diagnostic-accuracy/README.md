# Diagnostic Accuracy Eval Suite

Ground-truth fixtures for the Menda diagnostic pipeline. Tracks real
diagnostic accuracy as a measurable number rather than a vibe.

This is Phase 3 of `docs/Diagnostic-Accuracy-Hardening-Plan.md`.

## What this is

Each fixture under `fixtures/<trade>/` describes a plausible South African
residential fault, the canonical trade + subcategory it should route to, and
optional assertions about cost band, urgency, and cascading-damage text.

The fixtures are **test cases**, not training data. They represent
**patterns** any homeowner with that fault might describe — they are not
recordings of specific production cases.

```
src/__tests__/diagnostic-accuracy/
├── README.md                        ← you are here
├── runner.test.ts                   ← the Vitest runner
├── baseline.json                    ← locked passing set + expected-failure list
├── types.ts                         ← AccuracyFixture interface
├── fixture-loader.ts                ← file discovery + shape validation
└── fixtures/
    ├── plumbing/
    ├── security/
    ├── electrical/
    ├── pool/
    └── disambiguation/              ← cases where user label disagrees with reality
```

## Running it

```bash
pnpm run eval:diagnostic-accuracy
```

or directly:

```bash
npx vitest run src/__tests__/diagnostic-accuracy/
```

The suite is fast (no Gemini calls yet — pure shape + taxonomy validation).
Unverified fixtures show up as `it.skip(...)` so they remain visible in the
test output while not gating CI.

## The verification gate

Every fixture has a `verified` flag. It starts `false` and only flips to
`true` once a domain expert (typically a contractor) has signed off on the
ground truth:

```json
{
    "verified": false
}
```

CI **only runs** fixtures with `verified: true`. Unverified fixtures still
get shape validation, taxonomy cross-checks, and an `it.skip` entry, but
they are not part of the accuracy-gating set.

To flip a fixture to `verified: true`:

1. A contractor in the relevant trade reviews the case.
2. They confirm the trade, subcategory_id, failure_mode_id (if any), and the
   optional assertions.
3. Change `verified` to `true` and add the contractor reference to
   `ground_truth.notes` (e.g. `"...verified by Acme Plumbing 2026-05-27"`).
4. The runner will start exercising it on the next CI run.

## How CI uses baseline.json

`baseline.json` is a **ratchet**:

```json
{
    "passing": [],
    "expected_failures": []
}
```

- `passing` — fixture ids the system currently passes. If any of these fail
  in a CI run, that's a regression and the build fails.
- `expected_failures` — fixture ids that are verified but the system does
  not yet pass. They're tracked so we can promote them to `passing` once a
  fix lands.

The baseline only ever moves forward — fixtures get promoted from
`expected_failures` to `passing` as the pipeline improves. They never go
back.

A fresh fixture lands as either `expected_failures` (verified but the
system currently fails it) or stays out of the baseline entirely until
`verified: true`.

## Adding a fixture

1. Pick the right trade folder (or `disambiguation/` for ambiguity cases).
2. Copy an existing fixture as a starting point.
3. Name the file `<short-id>-NN.json`. The file name must match the `id`
   field inside the fixture.
4. Fill in `case_summary`, `inputs.user_text`, and the `ground_truth` block.
5. Reference a real `subcategory_id` from
   `src/lib/diagnosis/diagnosis-trade-taxonomy.ts`. The runner will fail
   loudly if you don't.
6. Pick a sensible `confidence_floor`:
   - `~85` for textbook clear cases.
   - `~75` for cases with one minor ambiguity.
   - `~60` for genuinely ambiguous / disambiguation cases.
7. Keep `verified: false` until a contractor has reviewed it.

### Fixture-content rules (important)

- Use **generic equipment descriptions**. No real brand+model+serial. The
  fixture should describe the kind of thing any user would write, not a
  copy-paste from a production audit log.
- Write the `user_text` as the homeowner would — symptoms first, technical
  jargon used only when it would actually appear.
- For `disambiguation/` fixtures: the `user_text` names ONE piece of
  equipment, but the described mechanism implies a different one. These
  test the Phase 1 USER-NAMED EQUIPMENT guard.

## What the runner does today vs tomorrow

**Today** the runner:

- Discovers all fixtures.
- Validates fixture shape against the `AccuracyFixture` interface.
- Asserts `subcategory_id` exists in `TAXONOMY_SUBCATEGORIES`.
- Asserts `trade` matches the taxonomy row.
- Asserts `failure_mode_id` (if set) exists in the subcategory's
  `failureModes` catalog.
- Skips unverified fixtures (`it.skip`).
- Cross-checks `baseline.json` against the fixture catalogue.

**Tomorrow** (once 50+ fixtures are verified) the runner will additionally:

- Drive the real Agent 2a + 2b pipeline against each verified fixture.
- Assert the resulting diagnosis hits `confidence_floor`, the correct
  trade/subcategory, and the optional cost / urgency / cascading-damage
  expectations.
- Diff each run against `baseline.json` and fail CI on regressions.

The hook point is `runDiagnosticPipelineStub` in `runner.test.ts`. Swap
that one function and the suite goes live.
