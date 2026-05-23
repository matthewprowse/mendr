# Testing build — follow-up work

Status of the multi-phase testing build (see [`.claude/agents/testing-build.md`](../../.claude/agents/testing-build.md)) and what still needs to happen.

**Author:** Matthew Prowse (with Claude testing-build agent)
**Last updated:** 2026-05-23

---

## What landed

7 of 8 phases shipped on branch `audit/2026-05-22`. Headline numbers:

| Metric | Before | After |
|---|---|---|
| Tests | 213 | **1,108** |
| Test files | 12 | 122 |
| Line coverage | ~3% (7-file allowlist) | **20%** of all src/** |
| Branch coverage | n/a | **66%** |
| Function coverage | n/a | **48%** |
| Diagnose route size | 1,475 lines | **297 lines** |
| `pnpm build` | broken | green |
| CI | none | `test` + `e2e` workflows |
| Finder-duplicate migrations | 6 | 0 |
| Broken `scripts/test-*.ts` | 5 | 0 |

Per-phase commits on `audit/2026-05-22`:

- Phase 0 — `test(phase-0): wire CI, widen coverage scope, retire broken scripts`
- Phase 1 — `test(phase-1): cover pure-function libs ...` (commit `f0d3092`)
- Phase 2 — `test(phase-2): refactor diagnose + providers handlers, pin LLM parsers with fixtures` (commit `6221fda`)
- Phase 3 — `test(phase-3): add contract tests for all API routes, adopt Zod validation` (commit `95567dc`)
- Phase 4 — `test(phase-4): add component + form behavior tests via Testing Library + MSW` (commit `5da6f7b`)
- Phase 5 — **deferred** (see [Required: install Docker](#1-required-install-docker--rerun-phase-5))
- Phase 6 — `test(phase-6): playwright E2E covering homeowner + contractor + auth golden paths` (commit `98fb56f`)
- Phase 7 — `test(phase-7): ratchet thresholds, document testing workflow, fixture refresh tooling` (commit `6c5377b`)
- Build fix — `fix(diagnose): narrow unknown types in route + contents-builder so build passes` (commit `9d910db`)
- Migration cleanup — `chore(supabase): delete 6 Finder-duplicate migration files` (commit `434f23f`)

---

## Required follow-ups (in priority order)

### 1. Required: install Docker → rerun Phase 5

**What:** Phase 5 (Supabase integration tests covering RLS, auth, CRUD round-trips) was skipped because Docker isn't installed locally. RLS bugs are silent data leaks; this is the only phase that catches them.

**Steps:**
1. Install Docker Desktop (`brew install --cask docker`) **or** OrbStack (`brew install orbstack` — lighter alternative).
2. Launch it once and let the daemon settle.
3. Re-invoke the `testing-build` agent with the same prompt template used for prior phases — the phase-detection logic will pick up Phase 5 next:

   > Working directory: `app/`. Branch: `audit/2026-05-22`. Run Phase 5 only — Supabase integration tests covering RLS, auth, CRUD round-trips. Follow `.claude/agents/testing-build.md`. Commit when done.

4. Expected outcome: `pnpm test:integration` script, `app/supabase/seed.test.sql`, RLS smoke tests per protected table, auth flow tests, CRUD round-trips, and an `integration` job in `.github/workflows/test.yml`.

**Effort:** ~3 hours of agent work after Docker is installed.

**What unblocks:** real proof that homeowner-A cannot read homeowner-B's diagnoses/saved providers/locations. Real proof that contractor application transitions work end-to-end against the actual database.

---

### 2. Required: enable branch protection on GitHub

**What:** CI runs on every push but doesn't yet block merges. A red CI is currently advisory.

**Steps:** In repo Settings → Branches → Branch protection rule for `main`:
- ✅ Require status checks to pass before merging
  - `test` job (lint + unit tests)
  - `e2e` job (Playwright)
- ✅ Require linear history
- ✅ Do not allow force pushes
- ✅ Do not allow deletions

Plus Settings → Actions → General:
- ✅ "Allow GitHub Actions to create and approve pull requests" (needed for the `refresh-fixtures.yml` workflow to open PRs)

**Effort:** 5 minutes.

---

### 3. Required: clean up 17 pre-existing lint errors

**What:** `pnpm lint` reports 17 errors, all pre-existing (not introduced by the testing build). They will fail the new CI `test` job on the first push to `main` once branch protection is on.

**Where they live:**
- `src/app/admin/**` clients (mostly `react-hooks/set-state-in-effect`)
- `src/app/match/**` clients (same)
- `src/app/global-error.tsx`
- `src/app/contractors/layout.tsx`
- `src/app/processing/client.tsx`
- `coverage/lcov-report/` — build artefact, should be `.eslintignore`d
- `src/app/landing2/.cache/` — should be `.gitignore`d and `.eslintignore`d

**Steps:**
1. Add to `.eslintignore` (or equivalent flat-config `ignores:` block):
   ```
   coverage/
   **/.cache/
   .next/
   playwright-report/
   test-results/
   ```
2. Triage each remaining error — most are real `useEffect` setState patterns that should either be deps-corrected or moved into event handlers.

**Effort:** 1–2 hours, low risk.

---

### 4. Required: decide on the messy commit history

**What:** Mid-build, a concurrent Claude session created `audit/2026-05-22` and committed a 158-file WIP snapshot (`ebb807b`) before Phase 1 landed. All subsequent phase commits sit on top of that snapshot. The actual test work is clean; the snapshot underneath is not.

**Options:**

| Option | Description | Effort |
|---|---|---|
| A | Cherry-pick the 7 phase commits (`f0d3092` through `6c5377b`) + `434f23f` + `9d910db` onto a fresh branch from `main`. Open one PR per phase OR one big PR. Most aligned with the "clean main" recommendation. | 1–2 hours |
| B | Squash the audit branch into one or two commits, rebase onto `main`, open a single PR. Simpler, but loses per-phase boundaries. | 30 min |
| C | Accept `audit/2026-05-22` as is, fast-forward `main` to it, document the WIP snapshot in the changelog. | 5 min |
| D | Leave the branch alone, open a PR from `audit/2026-05-22` → `main` and let GitHub squash-merge it. End state ≈ option B. | 5 min |

**Recommendation:** Option D if you don't care about per-phase commit history in `main`, Option A if you do.

---

### 5. Required: untracked / dirty files cleanup

**What:** `git status` on the inner repo shows pre-existing dirty/untracked files that aren't part of the testing build:

- `src/app/landing1/**` and `src/app/landing2/**` — modifications from earlier landing-page work
- `supabase/.temp/cli-latest` — Supabase CLI temp file
- `docs/strategy/` — untracked
- `src/app/landing1/.cache/`, `src/app/landing2/.cache/` — untracked build cache

**Steps:**
1. Decide what's real work vs cruft. The `.cache/` directories and `supabase/.temp/` should go straight into `.gitignore`.
2. The landing-page modifications need a human decision — they look like in-progress feature work that predates this build.

**Effort:** 30 minutes of triage.

---

### 6. Nice-to-have: refactor the contractor onboarding page

**What:** `src/app/contractors/.../page.tsx` (and its client) is **2,285 lines in one file with 11 inlined Step components**. Phase 4 covered Steps 1–2 with DOM tests; Steps 3–11 are deferred to Phase 6 E2E because they need Google Maps + file uploads + KYC selfie capture.

**Why this matters:** Steps 3–11 are some of the most complex UX in the product (KYC, business verification, document uploads). They're effectively untested.

**Steps:**
1. Extract each `Step<N>` component into its own file under `src/app/contractors/.../steps/`.
2. Per-step DOM tests with `userEvent` + MSW.
3. Cross-step navigation test (current state survives back-nav, validation gates the Next button).

**Effort:** 1 day. Best to do this as a standalone refactor, not bundled with other work.

---

### 7. Nice-to-have: production behavior consistency fixes

These are real findings from the build worth deciding on:

| Finding | Location | Recommendation |
|---|---|---|
| Returns 500 on malformed JSON instead of 400 (every other POST returns 400) | `/api/whatsapp-message` | Standardise to 400 |
| Dead routes — handlers exist but no UI calls them | `/api/waitlist`, `/api/contact/contractor` | Decide: wire up or delete |
| Uses `window.location.href = '/'` instead of `next/navigation` | `src/app/coming-soon/client.tsx` | Switch to `useRouter().push('/')` |
| Minor `loading` state edge when both magic-link and password missing | `src/components/auth-card.tsx` | Add early return + test |

**Effort:** 1–2 hours total.

---

### 8. Nice-to-have: Sentry → regression test loop

**What:** A script that fetches the top-N most-frequent production errors from Sentry and emits a skeleton regression test per error (with the stack frame, breadcrumbs, and a `test.todo`).

**Why:** Right now, production errors get fixed and forgotten. This would turn each into a permanent regression guard.

**Effort:** Half a day for v1.

---

## Reference

- Agent definition: [`.claude/agents/testing-build.md`](../../.claude/agents/testing-build.md)
- Project conventions: [`CLAUDE.md`](../CLAUDE.md)
- Contributing guide (created in Phase 7): [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Refresh LLM fixtures workflow: `.github/workflows/refresh-fixtures.yml` (repo root, `workflow_dispatch` only)
- LLM fixtures: `app/src/features/diagnosis/__tests__/fixtures/{classify,prose}/`
- Test helpers: `app/src/__tests__/helpers/route-test.ts`, `app/src/__tests__/msw/`, `app/e2e/helpers/`
