# Wave A — Discovery Summary

**Status:** ✅ Complete. Read-only. No source files modified.
**Audit branch:** `audit/2026-05-22`
**Pre-audit snapshot:** `wip/pre-audit-snapshot-2026-05-22` (rollback target)
**Head commit:** `f4371a7 chore: include stray lead-digest route in pre-audit snapshot`

---

## How to use this document

This is the morning entry point. Each row below is one phase report — read them in priority order, not numeric order. Tick boxes inside each report; once you've reviewed all seven, tell the agent "begin Wave B" and only approved findings will be touched.

---

## Findings count by area

| # | Area | Report | Total | High | Med | Low |
|---|---|---|---:|---:|---:|---:|
| A1 | `src/lib/` | [01-lib.md](2026-05-22-01-lib.md) | 17 | 0 | 0 | 17 |
| A2 | `src/features/` | [02-features.md](2026-05-22-02-features.md) | 9 | 1 | 2 | 6 |
| A3 | `src/app/api/` | [03-api.md](2026-05-22-03-api.md) | 18 | 3 | 3 | 12 |
| A4 | `src/app/` routes (non-api) | [04-app-routes.md](2026-05-22-04-app-routes.md) | 20 | 5 | 8 | 7 |
| A5 | `src/components/` | [05-components.md](2026-05-22-05-components.md) | 4 | 0 | 1 | 3 |
| A6 | Root, scripts, emails, configs, supabase, public | [06-root.md](2026-05-22-06-root.md) | 32 | 3 | 4 | 25 |
| A7 | Hot-path tests + doc drift | [07-tests-and-docs.md](2026-05-22-07-tests-and-docs.md) | 15 | 4 | 5 | 6 |
| **TOTAL** | | | **115** | **16** | **23** | **76** |

---

## Suggested review order (highest-leverage first)

These are the items the audit surfaced that, if approved, will have the most leverage on the codebase. Read the linked report sections, tick the boxes, then move on.

### 1. **Easy wins to clear out clutter** (A6, A4 — ~5 min)

- **3 corrupt git refs** at `app/.git/refs/heads/main 2`, `main 3`, `main 4`. Safe to `rm` once approved. (A6 #1)
- **`package-lock.json` exists alongside `pnpm-lock.yaml`** — CLAUDE.md says pnpm only. Delete the npm lockfile. (A6 #2)
- **`src/app/globals 2.css`** OS-duplicate, zero imports. Safe delete. (A4)
- **6 OS-duplicate Supabase migrations** with `" 2.sql"` suffix in `app/supabase/migrations/`. Safe delete. (A6)
- **Empty `_components/` directories** in `src/app/design/` and `src/app/report/`. (A4)

### 2. **Security-adjacent — needs immediate decision** (A3 — ~10 min)

- **`/api/beta-access/` has no rate limit** — password-guessing endpoint vulnerable to brute force. HIGH. (A3 F1)
- **Three cron routes have no `vercel.json` schedule entry**: `cron/contractor-onboarding`, `cron/homeowner-followup`, `cron/homeowner-reengagement`. Either schedule them or remove them. (A3 F3)

### 3. **The big bloat decisions** (A3, A4 — needs your call)

- **`src/app/api/diagnose/route.ts` is 1,555 lines** with zero direct test coverage. The audit recommends splitting it; depending on your appetite, this could be a multi-day extraction project on its own, OR you accept the current shape and add tests around it. (A3 F2, A7 F1)
- **`src/app/branding/client.tsx` (2,323 lines)** and **`src/app/contractors/(portal)/network/client.tsx` (2,285 lines)** — both internal-tool / portal pages. Decomposition is nice-to-have, not load-bearing. (A4)
- **`src/lib/providers/provider-enrichment.ts` (1,248 lines)** and **`diagnosis-trade-taxonomy.ts` (691 lines)** — A1 deemed both justified by their domain complexity; no action recommended. (A1)

### 4. **Hot-path test coverage gaps** (A7 — these are the riskiest area going forward)

Every diagnosis change today is made without a test safety net. The 4 HIGH-severity gaps:

- `app/api/diagnose/route.ts` — zero tests on the 1,555-line route.
- `features/diagnosis/agent-classify.ts` — Agent 2a has only finalize tests; the agent itself is untested.
- `features/diagnosis/agent-prose.ts` — Agent 2b has zero tests.
- `features/diagnosis/prompts/composer.ts` — 60% coverage; image/follow-up/hydration branches untested.

(A7 F1–F4)

### 5. **Documentation drift** (A7 — fix in Wave B alongside other changes)

- **CLAUDE.md says prompt version is `v6.0`; actual is `v7.3`** in `prompts/prompt-version.ts`. (A7)
- **CLAUDE.md `createBrowserClient` import path doesn't resolve** — `src/lib/auth/supabase.ts` doesn't export that symbol. (A7)
- **`ai-coding-improvements.md` items #2 (api business logic) and #8 (barrel exports) are checked but incomplete.** (A7)
- **9 env vars in CLAUDE.md missing from `.env.example`**; **10+ cruft variables in `.env.example` from retired phases** (SendGrid, Reddit, OpenAI). (A6)

### 6. **Routes / pages where intent is unclear** (A4)

The A4 sub-agent clarified disposition of these — your job is just to confirm or override:

| Route | A4 disposition | Action |
|---|---|---|
| `landing1/`, `landing2/` | Production marketing pages, indexed | Keep |
| `coming-soon/` | Beta gate landing | Keep |
| `branding/` | Internal design audit, no public link | Keep (but 2.3k lines) |
| `rate/*` | Production (linked from match/report) | Keep |
| `/about` | **Orphaned — page exists but unreachable** | Decide: delete or link |

### 7. **Low-priority / cosmetic** (A1, A6 — sweep through any time)

- 7 unreferenced files in `src/lib/` (likely safe deletes). (A1)
- 2 unreferenced components: `scan-flow-shell.tsx`, `auth-prompt-dialog.tsx`. (A5)
- 4 unreferenced TS scripts in `app/scripts/`. (A6)
- 1 unreferenced email template: `monthly-digest-unregistered.tsx`. (A6)
- 5 font files with spaces in filenames (`Soehne Extrafett.otf` etc.). (A6)
- `build.log` (156 KB), `README.md` (empty), `build-spec.txt` — all stale. (A6)

---

## Corrections noted during Wave A

- **A6 originally claimed `.env` is committed to git — this is FALSE.** Verified during the run: `git ls-files --error-unmatch .env` returned "did not match any file" and `.env` is properly listed in `.gitignore`. Finding #14 in the A6 report has been patched in-place to reflect this. No secrets are leaking in the repo.
- The pre-audit drift list expected `src/app/processing/[conversationId]/client 2.tsx` to exist — it doesn't on the audit branch. It was destroyed by the `git reset --hard` that I killed mid-baseline, or by the user's Cursor revert. Net result: one less OS-duplicate to remove. (A4)
- **There is a fourth broken git ref** that A6 missed: `refs/remotes/origin/main 2` (a remote-tracking ref, on top of the three local `refs/heads/main 2|3|4`). When applying the A6 #1 deletion, include this one too: `rm "app/.git/refs/remotes/origin/main 2"`.
- **One commit landed on `audit/2026-05-22` mid-run that did not originate from this audit:** `f0d3092 test(phase-1): cover pure-function libs for providers, rate-limit, content guard, email`. It is additive (new tests only) and does not affect the reports — but if you do a `git log` and see an extra commit, that's why. It's between `f4371a7` (the pre-audit stray-file commit) and `f8ea45c` (this summary). If you didn't make that commit yourself, the testing-build agent in `.claude/agents/testing-build.md` is the likely author.

---

## Baseline at audit start (from A0)

| Gate | Status |
|---|---|
| `pnpm exec tsc --noEmit` | ✅ passing |
| `pnpm test` | ✅ 28 files, 478 tests, 1.85s |
| `pnpm check:diagnoses-table` | ✅ passing |
| `pnpm lint` | ❌ 49 errors, 55 warnings — **pinned as regression budget for Wave B** |

435 TypeScript/TSX files under `src/`. 28 test files.

---

## What happens next

1. **You review** — open each report, tick `☐ Approve` or `☐ Keep` per finding.
2. **You say "begin Wave B"** — I execute Wave B as previously planned:
   - One phase per area, in the same order as Wave A.
   - One commit per finding category.
   - Test gate between every phase (the 4 gates above must hold, lint counts must not increase).
   - Any test failure halts the wave and reverts the offending phase.
3. **You may say "skip Wave B for area X"** — that phase is dropped from execution.
4. **You may say "do only items X, Y, Z"** — Wave B runs only those approved findings.

If you'd prefer a different review unit (e.g. you want me to batch-act on all the "trivial deletions" first as one PR-sized commit, then we look at the larger items together), just say so.
