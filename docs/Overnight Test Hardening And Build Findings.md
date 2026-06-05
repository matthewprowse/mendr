## Overnight Test Hardening And Build Findings

Work done autonomously on the isolated branch `test/t5-lib-tail` (a git worktree),
so the concurrent security workstream on `main` was never touched. Everything here
is committed and pushed to that branch and gathered in PR #2.

#### What Landed

- Database layer, the biggest due-diligence gap, now covered with a real Postgres
  engine via PGlite (embedded WASM, no Docker, no Supabase billing). The harness
  loads the actual Pro migrations on a stubbed base schema with Supabase auth and
  role shims, then proves what the JavaScript Supabase mock cannot, 38 tests:
  - RLS cross-tenant isolation for every Pro table, including WITH CHECK denial of
    cross-tenant inserts, anon sees nothing, service role bypasses.
  - next_invoice_seq gap-free per-provider numbering.
  - CHECK enums and unique partial indexes (one pending claim per provider and per
    user, one job per lead, one membership per provider and user, customer dedupe).
  - Foreign-key delete behaviour, CASCADE versus SET NULL, across provider,
    customer, quote, contact event, and user deletion.
  - Run with `pnpm test:db` (separate config, excluded from the fast unit run).
- Pro page server-component state tests (invoices, quotes, leads), 12 tests,
  covering signed-out redirect, claim call-to-action, pending-review, linked render.
- Coverage thresholds ratcheted to post-T5 actuals, lines and statements 26,
  branches 67, functions 53.
- Type-hygiene fixes on the T3 and T4 account and dialog test files so the suite
  type-checks clean.

Unit and contract suite, isolated run, 221 files and 2156 tests green. Database
suite, 38 tests green.

#### Critical Finding, The Production Build Is Broken

`pnpm build` fails type-check. There is no `ignoreBuildErrors` in the Next config,
so this blocks production deploys and blocks all end-to-end tests (the Playwright
web server runs `next build`). A full `tsc` run reports about 90 errors. This is
not introduced by the test work, the files are identical on the latest `origin/main`.

Breakdown by cause:

- About 42 errors are the half-removed diagnosis failure-modes and reasoning
  feature. The earlier cleanup deleted the test files but left the production
  scaffolding (agent-critique, agent-reasoning, prompts/failure-mode-serializer,
  lib/diagnosis/recommended-action, agent-prose, structured-clarification-card).
  These reference symbols that no longer exist. Resolving this needs the product
  decision the coverage plan flags for the diagnosis owner, finish the feature or
  remove the scaffolding. Out of scope for test work.
- About 18 errors are in demo and showcase pages (showcase, design, branding,
  page components trades, favourites, pro id mendr-reviews-block).
- A few are dead code in `src/components/ui.backup-20260529-141207`.
- The rest were type drift in the new test files, now fixed.

One concrete build fix is included, `admin/ai-costs/client.tsx` recharts Tooltip
formatter, committed separately as `fix(build): ...` so it can be cherry-picked to
`main`. It does not make the build pass on its own, the diagnosis-feature errors
remain the dominant blocker.

#### End To End, Why It Could Not Run Tonight

The Playwright scaffold is in good shape, browsers installed, config with
`MOCK_LLM`, `MOCK_PLACES`, `MOCK_BRAVE`, six specs present. It could not be run
because of three real blockers, in priority order:

1. `next build` fails, see above. The web server cannot start.
2. Even via `next dev`, the data and auth specs (contractor onboarding, auth and
   saved providers, contact form submit) need a seeded real database and mocked
   email, which are not wired. The homeowner full path additionally needs the
   client-side Google Maps JavaScript stubbed.
3. This branch is behind `main`, so an end-to-end run here would exercise a stale
   app rather than the current one.

Recommended unblock order, for whoever picks this up:

1. Decide the diagnosis failure-modes feature, finish or remove, to clear the bulk
   of the build errors, then clear the demo-page and dead-code errors.
2. With a green build, add a seeded test database (a Supabase branch driven from
   CI, or PGlite-backed fixtures) and an email mock, then un-skip the specs.
3. Add a `MOCK_GEOCODE` branch mirroring `MOCK_PLACES` for the homeowner location
   step, then enable the full homeowner path.

#### Branch And Billing Notes

- No Supabase branch was created. The project-scoped MCP cannot target a branch for
  queries (no branch parameter on `execute_sql`), so a branch would have cost money
  for no testable benefit, and the only writable connection points at production.
  PGlite gave production-faithful database tests for free instead. Nothing is
  billing, nothing needs turning off.
- The `app-t5` worktree can be removed after PR #2 is handled,
  `git -C app worktree remove ../app-t5` then `git branch -d test/t5-lib-tail`.
