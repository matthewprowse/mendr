# Test Suite Audit — June 2026

A fresh audit of the Mendr test suite, measured directly from the repo on 2026-06-09. This builds on (and does not replace) `Test Coverage Analysis And Plan.md`, which tracked phases T0–T5 to completion.

## Snapshot

| Layer | What exists | Runs in CI? |
| --- | --- | --- |
| Unit + contract (vitest, node) | ~217 files, ~1,944 tests | Yes |
| DOM component (vitest, jsdom) | 22 `.dom.test.tsx` files | Yes |
| DB integration (PGlite) | 6 files: RLS isolation, constraints, cascades, invoice sequence, hardening, smoke | **No** |
| Real-Postgres branch tests | 1 file, self-skips without `SUPABASE_DB_URL` | **No** |
| E2E (Playwright) | 6 specs, ~21 tests — but both deep golden-path journeys are `test.skip`'d | Yes (shallow parts only) |
| Coverage | ~35% lines actual at audit time; **62.0% lines now** (post coverage plan phases 0–9); thresholds ratcheted to 61/49/50/59 | Enforced (CI runs `test:coverage` since Phase A) |

API routes: 109 of 119 have contract tests. Components: substantially expanded. Hooks/context/features: covered across lib/auth, lib/providers, lib/whatsapp, lib/diagnosis, features/diagnosis, features/match. Test suite: **352 files / 3,217 tests** (up from 262/2,248 post audit Phases B–E). See `docs/plans/tests.md` for the path-to-70% plan — branches (49.5%) and functions (50.6%) are the remaining gap.

## 1. What you're doing well

**Layered test architecture.** Five distinct tiers with clean naming conventions (`.test.ts` → node, `.dom.test.tsx` → jsdom, `.db.test.ts` → PGlite, `.branch.test.ts` → real Postgres, `e2e/*.spec.ts` → Playwright), each with its own vitest/playwright config. This is textbook structure and rare to see at this stage.

**Contract testing of the API surface.** 92% of routes have contract tests following a consistent shape (auth gate, validation, happy path, error surfaces, rate limit), built on a shared `route-test.ts` helper with centralized mock factories. Malformed-JSON cases, cross-tenant 404s, and status-transition rules are pinned.

**Risk-based prioritization.** The P0 surfaces got tested first and deepest: gap-free invoice numbering, VAT logic, payment math, issue-then-lock immutability, RLS tenant isolation, POPIA routes, admin/cron auth. The money path is the best-covered part of the codebase.

**Deterministic external boundaries.** MSW for client-side fetches, env-driven mocks (`MOCK_LLM`, `MOCK_PLACES`, `MOCK_BRAVE`) so E2E runs against a production build with zero paid API calls, injectable fetch in lib clients, fake timers for date logic.

**Tests that pin reality, not intent.** E.g. locking the actual en-ZA `formatZar` output ("R 1 234,56") rather than the comment's claim, and documenting that a change would be deliberate.

**CI fundamentals.** Typecheck + lint + unit as a blocking gate, E2E gated behind it, Playwright browser caching, concurrency cancellation, failure artifacts uploaded.

**Living documentation.** The coverage analysis doc with measured (not estimated) numbers, a decisions log, and a ratchet policy for thresholds.

## 2. What you're not doing well

**Your strongest tests never run automatically.** The PGlite DB suite — RLS isolation, constraint, cascade, and invoice-sequence tests — is not in `test.yml`. A migration that breaks tenant isolation would merge green. This is the single biggest problem: the security-critical tier is opt-in.

**Coverage thresholds are decorative.** CI runs `pnpm test`; thresholds only apply under `--coverage`. The ratchet policy exists on paper but nothing enforces it.

**E2E is shallow where it matters.** The "full happy path: submit → processing → report → match" and "apply → pending → admin-approve → live" journeys are skipped. What runs are render/enable checks. There is no E2E for the Pro portal at all — the revenue path has zero browser coverage.

**The component layer is a gap.** 6 of 83 shared components, ~12 of 50 hooks/context/features files. Portal client pages got DOM tests in T4, but the shared component library (forms, dialogs, upload flows) where regressions are most visible to users is untested.

**Untested routes include the dangerous ones.** Of the 10 untested routes, `admin/cost-research` spends real money (its tests exist per the plan doc but the route dir has none — verify), two cron routes, `admin/beta-codes`, the WhatsApp simulator, and `diagnose/refinement` (core product flow).

**Email is one rendering bug from silent breakage.** 21 React Email templates, 1 test. These render at send time; a broken template fails in production, per recipient.

**`proxy.ts` is untested.** The beta gate / routing middleware guards the whole app and is only exercised indirectly by E2E (which disables it).

**No quality coverage of the AI core.** The diagnostic-accuracy eval harness was deleted in T0 (correctly — it was stale), but nothing replaced it. The diagnosis pipeline, the product's heart, has unit tests for parsing/orchestration but no accuracy/regression eval. The deleted harness had already caught a real fixture/taxonomy drift.

**Branch tests have no scheduled home.** `branch-rls.branch.test.ts` self-skips everywhere; real-Postgres RLS behavior is never verified.

**Minor:** `scripts/` (cost reconciliation, eval tooling) has zero tests; no a11y or visual regression checks; full `pnpm build` on every PR makes E2E the slow lane (~accepted trade-off, but worth watching).

## 3. The plan — comprehensive test structure

Keep the existing five-tier structure and naming taxonomy; it's right. The plan is to enforce it, deepen it, and add two missing tiers (AI evals, a11y). Priority bands follow the existing P0/P1/P2 convention.

### Phase A — Enforce what already exists (days, not weeks; highest ROI)

**Status (2026-06-09): items 1, 2, 4 and 5 landed**, plus the proxy tests and email render smoke tests from Phase B. What landed: `db-tests` job in test.yml (blocking), CI unit step switched to `test:coverage`, nightly workflow (needs the `SUPABASE_DB_URL` repo secret to activate branch tests), contract tests for all 10 untested routes, `proxy.ts` beta-gate tests, render smoke tests for all 17 email templates, thresholds ratcheted 35/27/22/33 → 36/29/24/35. Verified locally: 240 files / 2,098 unit tests green, 6 files / 46 PGlite db tests green, tsc clean, lint clean. Item 3 (skipped E2E journeys) remains open. Two findings for follow-up: `contractorApplicationReceivedText` and `contractorApprovedText` take positional args unlike every other template's props-object text fn (works, but a refactor trap); and the route-test mock helper reports the wrong op for `.update()/.insert()` chains ending in `.select()` — tests work around it by call order, but the helper could track the first mutating op instead.

1. Add a `db-tests` job to `test.yml` running `pnpm test:db` (PGlite needs no services — it's pure npm). Make it blocking.
2. Switch the CI unit step to `pnpm test:coverage` so thresholds actually gate. Adopt the ratchet rule formally: thresholds only ever go up, raised to `floor(actual)` at the end of each phase below.
3. Fix or consciously delete the skipped deep E2E journeys (01 and 03). A skipped golden-path test is worse than none — it reads as coverage. The blocker noted in the docs (contents-builder.ts build error) is reported as unconfirmed; confirm it first.
4. Add a nightly scheduled workflow that runs `test:integration` against a Supabase branch (create branch → run → delete), plus `test:db` and full E2E. Nightly, not per-PR, so cost and time stay sane.
5. Write contract tests for the ~10 untested routes. Order: `admin/cost-research` (spends money), the two cron routes, `diagnose/refinement`, `admin/beta-codes`, `pro/reviews/[id]/reply`, `pro/providers/search`, `diagnoses/[id]/cost-estimate`, WhatsApp simulator last (dev-only, P2).

### Phase B — Close the P0/P1 unit gaps (1–2 weeks)

**Status (2026-06-10): complete.** Items 1–2 landed in Phase A; items 3–5 landed now. Added: `lib/logging/logger.ts` and `lib/email/tokens.ts` tests (item 3 — the email *dispatch* logic in `notify-contractor-of-lead.ts` was already covered, so the real gaps were the logger + the asset-origin/font-face token helpers); `lib/ai` adapter contracts — `ai-client.ts` (client memoisation, model-name env overrides, missing-key error), `ai-logging.ts` (structured envelope shape), `gemini-cache-manager.ts` (cache reuse / TTL refresh / no-name + throw → null fallback), `ai-diagnosis-backend.ts` (override gating), `ai-call-logger.ts` (`textifyGeminiContents` never inlines image bytes; `logAiCall` disable flag + `after()` scheduling) (item 4); and stateful hooks/context (item 5) — `image-store.ts` (memory-primary + sessionStorage fallback + quota swallow), `use-mobile.ts`, `use-saved-provider.ts`, `use-contractor.ts` (SSR hydration + 404/error mapping), and `auth-context.tsx` (`useAuth` guard, spinner gate, signOut audit event, subscription teardown). 12 new files.

1. `proxy.ts`: unit-test the beta gate, public-path allowlist, and redirect logic directly.
2. Email render tests: one smoke test per template — `render()` succeeds, key dynamic fields appear, no broken links. Mechanical, ~21 small tests, kills a silent-failure class.
3. `lib/email` dispatch logic (21 source files, 1 test) and `lib/logging`.
4. `lib/ai` (10 source files, 3 tests): pin the adapter contracts around Gemini — request shaping, error mapping, mock-mode branches.
5. Hooks/context: target the stateful ones (image-store, session/auth context) with renderHook tests; skip trivial wrappers.

### Phase C — Component layer (2–3 weeks, parallelizable)

**Status (2026-06-10): first wave landed (8 files / 47 tests).** Prioritised the highest-regression-risk logic per category rather than chasing 83/83: the **photo/HEIC upload flow** (`lib/diagnosis/photo-upload.ts` — `isHeicLike`, `dataUrlToFile`, `normalizeSelectedPhoto` HEIC-convert success/failure, `uploadPhotoToStorage`); a form input with debounce + Places fetch + selection (`address-autocomplete.tsx`); a save toggle with auth-gating + optimistic semantics (`save-provider-button.tsx`); a confirmation dialog (`diagnosis-leave-dialog.tsx`); conditional rendering driven by route/auth (`account-tab-bar.tsx` longest-prefix active tab, `user-avatar.tsx` initials derivation); and `markdown.tsx` + `print-button.tsx`. `compressImage` is canvas-bound (no jsdom canvas) so it's mocked at the boundary. Remaining shared components (e.g. `contact-popover`, the network onboarding steps) are the next wave.

Don't aim for 83/83. Test the ~20 components with logic: forms with validation, the photo/HEIC upload flow, dialogs with confirmation semantics, anything with conditional rendering driven by server state. Use the existing jsdom project + MSW pattern from T4. Explicitly exclude `components/ui/**` (shadcn primitives) as coverage config already does.

### Phase D — E2E depth (2–3 weeks)

**Status (2026-06-10): homeowner path deepened + verified; revenue path scoped to the nightly tier.** The blocker cited in Phase A item 3 (a TS build error in `contents-builder.ts:147`) is **resolved** — `tsc` is clean and a production build succeeds. The skipped homeowner golden-path placeholders (specs 01 + 06) are replaced with real journeys that walk `/start` → describe → location (granted geolocation + a stubbed `/api/geocode`, which `MOCK_PLACES` does not cover) → submit → assert navigation into `/processing/<id>`. That submit is a client-side `router.push` with no DB write, so it's deterministic without Supabase; the `/processing → /report → /match` leg persists/reads the diagnosis and stays in the nightly Supabase-branch run. While doing this I found and fixed **stale selectors that had silently rotted the suite**: the fault-description field's placeholder is gone (now a `Problem Description` label) and `/contractors` now 301s to `/pro` with the apply CTA at `/pro/network` (specs 01/02/06/03 updated). Full E2E now runs **20 passed / 8 skipped / 0 failed** (desktop + mobile). Item 4 (beta-gate spec) and items 2–3 (Pro revenue lifecycle, contractor approve → live) genuinely need a seeded Supabase branch and belong in the nightly tier (Phase A item 4) — writing them as per-PR specs would be all-skip placeholders. They are the remaining Phase D work.

1. Homeowner: full start → diagnose → report → match journey (mocked LLM/Places), desktop + mobile.
2. Pro portal lifecycle: login → lead → quote (VAT) → won → job → invoice issue → payment recorded. This is the revenue path; one thorough journey beats ten shallow specs.
3. Contractor onboarding: apply → pending → admin approve → live.
4. Auth persistence and the beta gate (run one spec with `COMING_SOON_PASSWORD` set to verify the gate works, since all other E2E disables it).
5. Keep the suite small (≤12 journeys). E2E earns its place by depth.

### Phase E — Missing tiers (ongoing)

**Status (2026-06-10): all three tiers seeded.** (1) **AI accuracy evals** rebuilt under `src/features/diagnosis/__evals__/`: a 15-fixture set (real SA fault descriptions → canonical trade), a pure scorer (`accuracy.ts`) + orchestrator (`run-eval.ts`) unit-tested in the blocking suite, a `SERVICE_LABELS` drift guard (the exact failure mode the deleted harness once caught), a CLI (`scripts/diagnosis-accuracy-eval.ts` / `pnpm eval:accuracy`) with a free MOCK_LLM *structure* mode and a budget-gated *live* trend mode (refuses to spend without `DIAGNOSIS_EVAL_LIVE=1` + a real key), and a weekly non-blocking workflow (`.github/workflows/diagnosis-eval.yml`). (2) **Accessibility**: `e2e/07-accessibility.spec.ts` runs `@axe-core/playwright` (WCAG 2 A/AA) over the public funnel as a *regression gate* — it baselines the documented pre-existing debt (`/start`: one `label` violation; `/pro`: `color-contrast` on 11 nodes; `/contact`: clean) and fails only on NEW critical/serious rules. (3) **DB-suite growth rule** added as a PR-template checkbox (`.github/pull_request_template.md`), alongside a naming-taxonomy reminder.

1. **AI quality evals.** Rebuild the diagnostic-accuracy harness as a separate, non-blocking scheduled job: a fixture set of real fault descriptions → expected trade/category, run against the mock-mode pipeline for structure and (budget-gated, like cost-research's `dryRun`) against the live model weekly for drift. Track accuracy as a trend, not a pass/fail gate.
2. **Accessibility.** Add `@axe-core/playwright` assertions to the existing E2E specs — a few lines per page, catches WCAG regressions on the public funnel.
3. **DB suite growth rule.** Every new migration that touches RLS, triggers, constraints, or sequences ships with a `.db.test.ts` in the same PR. Make it a PR-template checkbox.

### Standing policies

- **Naming taxonomy is law:** `.test.ts(x)` unit/contract, `.dom.test.tsx` jsdom, `.db.test.ts` PGlite, `.branch.test.ts` real Postgres, `e2e/*.spec.ts` Playwright. Document in README so the convention survives contributors.
- **Definition of done for any new route:** contract test in the same PR (auth, validation, happy, error). The 92% number proves the team can hold this.
- **No skipped tests on main** without a linked issue and an expiry date.
- **Coverage ratchet:** raise thresholds at each phase end; never lower. Realistic end-state target: 55–60% lines overall, with `lib/pro`, `lib/cost`, `lib/auth`, and `api/pro/**` held above 80%.
- **Flake policy:** a test that flakes twice gets quarantined (moved to a non-blocking job) and fixed within a week, not retried forever.

### Sequencing summary

Phase A is the week-one win — it's mostly CI wiring and makes the existing 2,000+ tests and the RLS suite actually protect you. B and C are steady gap-closing. D gives the revenue path browser coverage. E adds the tiers a diagnosis-AI product specifically needs. After A, every phase ends with a coverage ratchet commit.
