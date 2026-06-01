# Eval matrix guide

The eval matrix lets you compare Menda's diagnosis pipeline across `(model × prompt-variant)` cells using a labelled fixture set. This guide covers:

- Labelling new fixtures in the candidates markdown
- Adding photos for them
- Running smoke vs full vs dry-run matrices
- Estimating Gemini cost before you run
- Reading per-category results

If you only need to know *one* command, it's this:

```bash
npm run eval:matrix:dry-run    # preview what would run, no Gemini calls
```

---

## How the fixture pipeline fits together

1. **Candidates markdown** — `~/Downloads/test-data-candidates.md`
   Produced by the overnight test-data scout (see `~/Downloads/prompt-orchestrator.md` for the format spec). One table per subcategory; each row is a candidate test case.
2. **Photos** — `~/Downloads/<fixture-id>.HEIC` (single) or `<fixture-id>-1.HEIC`, `<fixture-id>-2.HEIC`, ... (multi)
   You download these manually — the loader will only ship a fixture into the matrix if it can find a photo file on disk.
3. **Loader** — `scripts/eval-load-fixtures.ts`
   Parses the markdown, indexes photos in `~/Downloads/`, returns ready-to-run `TestCase` objects. Fixtures with no matching photo are skipped with a count.
4. **Matrix** — `scripts/eval-matrix.ts --fixtures <path>`
   Runs the selected fixtures across the four (A/B/C/D) model-and-prompt cells, scores routing + commit accuracy, rolls up by trade.
5. **Compare** — `scripts/eval-compare.ts <before.json> <after.json>`
   Side-by-side diff of two matrix runs. Highlights regressions.

---

## Labelling a new fixture in the markdown

Each fixture is a row in a markdown table under a `#### <subcategory_id>` heading. The column order is fixed (see `scripts/eval-load-fixtures.ts` `HEADER_ALIASES` for accepted variants):

```markdown
#### geyser_fault_plumbing

| ID | Description | user_text | Image candidates | Suggested search | expected_sid | expected_trade | requires_clarification | title_includes_any |
|----|-------------|-----------|------------------|------------------|-------------|----------------|------------------------|-------------------|
| geyser-burst-ceiling-1 | Hot water bursting through ceiling | "Water is gushing out of the bathroom ceiling and the geyser is in the roof." | [link.com](url) | geyser burst ceiling cape town | geyser_fault_plumbing | Plumbing | false | Geyser, Burst, Ceiling |
```

Field-by-field:

| Field | Required? | Notes |
|---|---|---|
| **ID** | yes | Lowercase kebab-case, must be unique. This is also the photo filename stem. |
| **Description** | recommended | Human-readable note for the reviewer; not used in scoring. |
| **user_text** | yes (but can be `""`) | The message the homeowner would type. Empty string = photos-only. |
| **Image candidates** | no | URLs you found while researching — used to source the photo, not loaded by the eval. |
| **Suggested search** | no | A query string to find a photo if the candidate URLs are dead. |
| **expected_sid** | yes | Must match a real `TaxonomySubcategory.id` from `src/lib/diagnosis/diagnosis-trade-taxonomy.ts`. Used for routing scoring. |
| **expected_trade** | yes | One of: `Security`, `Electrical`, `Plumbing`, `Building & Construction`, `Carpentry & Woodwork`, `Flooring & Tiling`, `General Handyman`, `Locksmith`, `Painting`, `Pool Maintenance`, `Garden & Landscaping`, `Rubble & Waste`, `Welding`. Common abbreviations (`Building`, `Garden`, `Carpentry`, `Flooring`, `Pool`, `Rubble`) are normalised by the loader. |
| **requires_clarification** | yes | `true`/`false`. The matrix scores `commit = !requires_clarification` — a fixture flagged `true` is expected to ask for clarification, not commit to a diagnosis. |
| **title_includes_any** | optional | Comma-separated keywords. Scored as "title contains at least one of these (case-insensitive)". Leave empty if you don't want to constrain the title. |

The loader is tolerant of:
- Extra columns (ignored)
- Re-ordered columns (matched by header name, not position)
- Markdown link syntax in cells (`[text](url)` → kept as `text`)
- Inline backticks and italics
- Wrapping quotes around `user_text` (stripped)

---

## Adding photos

Naming convention is enforced by the loader (see `resolvePhotos` in `eval-load-fixtures.ts`):

```
~/Downloads/<fixture-id>.HEIC                           ← single-photo fixture
~/Downloads/<fixture-id>-1.HEIC                         ← multi-photo, first
~/Downloads/<fixture-id>-2.HEIC                         ← multi-photo, second
~/Downloads/<fixture-id>-3.HEIC                         ← ... up to -10
```

Accepted extensions: `.HEIC`, `.heic`, `.jpg`, `.jpeg`, `.png` (and uppercase variants). Comparison is case-insensitive on the stem.

The matrix's HEIC-to-JPEG step uses macOS `sips`. If you're on Linux you'll need to extend `convertHeicToJpeg` in `eval-matrix.ts` to use `heif-convert` or similar.

If multiple files share a stem (e.g. `foo.HEIC` and `foo.jpg`), the loader picks alphabetically — but you'll generally have one file per stem.

---

## Running the matrix

### Smoke test (cheapest validation)

```bash
npm run eval:matrix:smoke
```

Equivalent to:
```bash
npx tsx scripts/eval-matrix.ts --fixtures ~/Downloads/test-data-candidates.md --cells A,D --max-fixtures 8
```

Runs up to 8 fixtures × 2 cells (A vs D) × 1 round = 16 trials. Good for sanity-checking a prompt change before committing the cost of a full run.

### Full run

```bash
npm run eval:matrix:full
```

Runs every fixture with a verified photo against all 4 cells. Cost grows linearly with the number of photos you've downloaded.

### Dry run

```bash
npm run eval:matrix:dry-run
```

Lists every fixture that *would* run, grouped by subcategory, with a rough cost estimate. No Gemini calls, no env-var requirements. Use this before committing to a full run.

### Backward-compat (the original 4)

```bash
npm run eval:matrix
```

Still runs the hardcoded 4-fixture set (`Geyser`, `Garage Door`). Useful when you want to compare against historical reports that pre-dated the markdown loader.

### Custom slices

```bash
# Only cells A and D
npx tsx scripts/eval-matrix.ts --fixtures <path> --cells A,D

# Cap the run at 20 fixtures (whichever 20 the loader returns first)
npx tsx scripts/eval-matrix.ts --fixtures <path> --max-fixtures 20

# 3 rounds per cell for stability measurement
npx tsx scripts/eval-matrix.ts --fixtures <path> --rounds 3

# Different dev server
npx tsx scripts/eval-matrix.ts --fixtures <path> --base http://localhost:4000
```

---

## Cost projections

Rough back-of-envelope rates (Gemini 2.5-flash, May 2026 pricing — refresh this if Google moves the goalposts):

- Per trial: ~$0.04 (3 images @ 2.5-flash + ~1.5k input tokens + ~600 output tokens)
- Trials = fixtures × cells × rounds

| Configuration | Fixtures | Cells | Rounds | Trials | ~Cost |
|---|---|---|---|---|---|
| Backward-compat | 4 | 4 | 1 | 16 | $0.64 |
| Smoke (A,D × 8 fixtures) | 8 | 2 | 1 | 16 | $0.64 |
| Full @ 30 photos | 30 | 4 | 1 | 120 | $4.80 |
| Full @ 60 photos | 60 | 4 | 1 | 240 | $9.60 |
| Full @ 100 photos | 100 | 4 | 1 | 400 | $16.00 |
| Stability @ 30 photos × 3 rounds | 30 | 4 | 3 | 360 | $14.40 |

The dry-run prints the cost projection so you don't have to compute it by hand.

---

## Reading per-category results

When you run with `--fixtures` (markdown source), the report includes a **Per-category accuracy** section:

```markdown
## Per-category accuracy

### Cell A — 2.5 model + v2.5 prompts

| Trade | Fixtures | Routing | Commit |
|-------|---------:|--------:|-------:|
| Plumbing | 10 | 8/10 (80%) | 6/10 (60%) |
| Electrical | 9 | 9/9 (100%) | 7/9 (78%) |
| Security | 6 | 5/6 (83%) | 4/6 (67%) |
```

- **Routing** = subcategory_id AND trade both match. This is the strictest correctness measure — if Agent 2a routes a "burst pipe" to `roof_leak_repair` it's wrong, even if the trade is correct.
- **Commit** = `requires_clarification` matches expectation. A fixture marked `requires_clarification: false` expects the model to commit to a diagnosis; one marked `true` expects it to ask a clarifying question.
- **Fixtures** = unique fixture ids in this trade (does not multiply by rounds).

The **One-line summary per cell** distills each cell's per-category numbers into a single grep-able line, in the style of:

> **A**: Plumbing: 8/10 routing, 6/10 commit; Electrical: 9/9 routing, 7/9 commit

Useful when you want to skim across many runs without rendering full tables.

### Headline numbers

The per-cell aggregate table at the top sums across all categories:

| Cell | Score | Mean conf | Commit rate | Title stability |
|---|---|---|---|---|
| A | 18/25 (72%) | 67.5 | 65% | 80% |

- **Score** = `correct_checks / total_checks` across `subcategory_id`, `trade`, `title_includes_any`, and `commit` for every fixture × round.
- **Mean conf** = average `confidence` returned by Agent 2b.
- **Commit rate** = fraction of trials where the model committed (didn't ask for clarification). Only fixtures with a `subcategory_id` are counted.
- **Title stability** = how often the most-common title for a fixture is repeated across rounds (1.0 = identical every round, lower = unstable wording). Only meaningful with `--rounds > 1`.

---

## Comparing two runs

```bash
npm run eval:compare -- tmp/eval-live/matrix-2026-05-28T08-00.json tmp/eval-live/matrix-2026-05-28T18-00.json
```

Produces `compare-<ts>.md` next to the inputs with:

- **Headline** — counts of cells that improved / regressed / flipped fixtures
- **Aggregate per cell** — score delta, mean-conf delta, commit-rate delta with `✅` (improvement), `⚠️` (regression), or `·` (flat) markers
- **Per-category fixture counts** — when both runs used markdown fixtures
- **Per-fixture flips** — every fixture whose sid/trade/title changed between runs, sorted regressions-first

Pass `--out my-comparison-name` to control the output filename.

---

## Troubleshooting

**"Skipped N candidate(s) with no photo"**
  Expected — the markdown has more candidates than you've downloaded photos for. Loader only ships fixtures that have a file on disk matching `<id>.HEIC` / `<id>-N.HEIC`. To see *every* candidate in the dry-run regardless of photo, the dry-run mode already passes `ignoreMissingPhotos: true`.

**"ALLOW_MODEL_OVERRIDE_FROM_REQUEST is not set to '1'"**
  The matrix needs this flag in `.env.local` so the dev server respects `modelOverride` and `promptVariant` from the request body. Without it, every cell would run the same model and the comparison would be meaningless. The matrix refuses to run when the flag is missing. Dry-run bypasses this check.

**"missing photo: /Users/.../Downloads/foo.HEIC"**
  This only happens on a non-dry-run when the loader thought a photo existed but the file disappeared between load and run. Re-run the loader (or just the dry-run) to refresh the picture.

**Loader silently skips a row**
  Make sure the row has a non-empty `ID` cell, and the table starts with the standard header row directly under a `#### <sid>` heading. The loader requires both `id` and `user_text` columns; if your custom table is missing either, the entire table is ignored.

---

## Adding more fixtures

The lazy path: append rows under the relevant `#### <sid>` heading in `~/Downloads/test-data-candidates.md`, download the photos, re-run the matrix.

The structured path: extend the markdown to cover edge cases the diagnosis pipeline still gets wrong. Each fixture should test a specific behaviour:

- **Routing precision** — pick a fault that lives on the border between two subcategories (e.g. burst geyser ceiling: `geyser_fault_plumbing` vs `roof_leak_repair`). Set `requires_clarification: false` if the evidence resolves the ambiguity; `true` if it doesn't.
- **Clarification appropriateness** — minimal-evidence cases where the right answer is "ask the user a question", not "commit to a diagnosis".
- **Title quality** — set `title_includes_any` to keywords the diagnosis title MUST contain. This catches model regressions where the title becomes too generic ("Geyser problem" instead of "Corroded Geyser Tank").

The fixtures in `docs/eval-matrix-sample-fixtures.md` are a worked example with explanations.
