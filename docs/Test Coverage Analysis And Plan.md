## Test Coverage Analysis And Plan

This document is a full audit of the Mendr test suite as of June 2026. It records what is tested, what is not, the test files that currently fail typecheck (with a fix plan for each), and a sequenced plan to close the gaps. The plan is deliberately split into work we can do now with no new tooling, and work that needs a real database harness (Docker or a Supabase branch), which is deferred.

The numbers in the Snapshot were measured directly from the repo, not estimated. Where a claim could not be confirmed by hand it is marked as needs confirmation.

#### Snapshot

| Dimension | Count | Tested | Untested |
| --- | --- | --- | --- |
| API routes (route.ts) | 115 | ~76 | ~39 |
| lib + features modules | ~155 | ~35 | ~120 |
| Server pages (page.tsx) | 84 | ~0 direct | 84 |
| Client components (client.tsx) | 67 | 0 | 67 |
| Shared components (non ui) | ~27 | 3 | ~24 |
| e2e specs | 6 | all 6 partly skipped | n/a |
| DB RPCs / triggers / RLS policies | 9 / 2 / ~28 | 0 at DB level | all |

Coverage thresholds recorded in vitest.config.ts (the current actuals): lines 20.78 percent, branches 66.42 percent, functions 48.18 percent, statements 20.78 percent. The branch and function figures are reasonable. Lines and statements are low because whole subsystems have no tests at all: the entire Pro portal, almost every page and client component, and the database layer.

The single largest untested surface is the Pro portal (Phases 4 to 10): leads, jobs, customers, quotes, invoices, team, plan, and settings. It is also the revenue path, and its money logic (gap-free invoice numbering, VAT, payment math, issue-then-lock immutability) and tenant isolation (RLS) are untested.

#### Progress Checklist

This is the live tracker. Each box is ticked as the work lands and is pushed.

Phase T0, Stabilise the failing tests:

- [x] Group C, remove stale suppression directives in setup-dom.ts
- [x] Group D, fix component session typing in auth-card.dom.test.tsx
- [x] Group B, fix the route-test helper and the downstream type-drift files (route-test.ts, validation.test.ts, handler-places-client, handler.integration, cron contractor-onboarding, contact, contact contractor, diagnose integration). All 58 tests in the touched files pass.
- [ ] Group A, reconcile diagnosis type and export drift across 7 files. BLOCKED, see note below. These test files reference types that production diagnosis code also references and fails on (an incomplete feature refactor), so they cannot be fixed in isolation without repairing or reverting that feature.
- [x] Added a typecheck script (npm run typecheck). Not yet wired as a blocking CI gate because the codebase has a pre-existing non-test baseline of failures (see note); wire it once that is at zero.
- [ ] Whole test suite typechecks clean (blocked on Group A and the diagnosis-feature production errors)

Phase T1, Pure-logic unit tests:

- [x] plans.ts (8 tests)
- [x] format-money.ts (4 tests; locks the real en-ZA output "R 1 234,56")
- [x] format-date.ts (8 tests; relative buckets pinned with fake timers)
- [x] phone.ts, closed the formatSaPhoneInput gap (6 new tests)
- [x] rate-limit-config.ts (10 tests; getCallerIp, isRateLimitBypassed, config sanity)
- [x] auth/admin-auth.ts (10 tests; token create/verify, expiry, tamper, wrong password, cookie helpers)
- [x] auth/cron-auth.ts (5 tests; exact Bearer match, trim, unset secret)
- [x] diagnosis/trade-resolver.ts (5 tests)
- [x] providers/open-status.ts (already had a 9.4 KB suite from June; left as-is, the earlier inventory was wrong to call it untested)
- [x] providers/provider-profile-clean.ts (11 tests; sanitize, low-signal, normalize-for-storage)
- [x] diagnosis/parse-diagnosis-from-model-response.ts (9 tests; tags, fences, smart quotes, trailing junk, null cases)

Phase T1 complete.

Phase T2, Resolver and Pro route contracts:

- [ ] providers/claimed-provider.ts (resolver)
- [ ] pro/invoices and pro/invoices/[id]
- [ ] pro/quotes and pro/quotes/[id]
- [ ] pro/claim
- [ ] pro/members and pro/members/[id]
- [ ] pro/plan
- [ ] pro/leads/[id]
- [ ] pro/jobs and pro/jobs/[id]
- [ ] pro/customers and pro/customers/[id]
- [ ] pro/settings

Phase T3, Account and POPIA route contracts:

- [ ] account/delete
- [ ] account/export
- [ ] account/data-consent
- [ ] account/consents and account/consents/revoke
- [ ] account/avatar
- [ ] account/password
- [ ] account/profile, account/phone, account/consent-settings, account/notification-preferences
- [ ] admin/claims PATCH
- [ ] admin/ai-pricing
- [ ] contractors/account/service-area

Phase T4, Pro UI component tests:

- [ ] invoices, quotes, plan, team, claim clients
- [ ] leads, jobs, customers, settings clients
- [ ] interactive shared components (pro-tab-bar, consent dialog, auth-prompt)
- [ ] Pro page empty and pending states

Phase T5, Remaining lib and P2 tail:

- [ ] whatsapp/session-manager.ts
- [ ] notify-contractor-of-lead.ts gaps
- [ ] P2 utilities and read-only routes

Deferred, needs Docker or a Supabase branch (see Part 5):

- [ ] Database-layer tests (RLS isolation, next_invoice_seq atomicity, SECURITY DEFINER lockdown, triggers, constraints, cascades)
- [ ] End-to-end Pro lifecycle, team invite, plan enforcement, auth persistence

#### Things Coming Up Or To Integrate Later

A running log of decisions and integrations surfaced while building tests. Add to this as we go.

- Incomplete diagnosis-feature refactor (discovered during T0, needs a decision). A clean tsc --noEmit run from the app directory reports about 130 errors. Of these, roughly 64 are in PRODUCTION diagnosis code, not tests: agent-reasoning.ts, agent-critique.ts, agent-prose.ts, prompts/failure-mode-serializer.ts, lib/diagnosis/recommended-action.ts, prompts/taxonomy-serializer.ts, and others. They reference symbols that no longer exist: DiagnosticReasoning, FailureMode, a failureModes property on TaxonomySubcategory, EXCLUDED_SERVICES, buildSystemInstructionV2, and an agent-reasoning member missing from PipelineStepName. This looks like a half-finished or half-reverted failure-modes and reasoning feature. The 46 remaining Group A test errors are the tests for exactly this feature, so they cannot be made to typecheck until the feature is completed or reverted. These same 7 test files (29 tests) also fail at runtime under vitest (for example, expected undefined to be defined for failureModes), so this is a genuine incomplete feature, not merely a typing mismatch. The rest of the suite is green: 159 of 166 files and 1851 tests pass.

What is not built (investigated June 2026). The feature is a failure-modes plus structured-reasoning upgrade to the diagnosis pipeline. The consumer code that uses failure modes was committed (agent-reasoning.ts, agent-critique.ts, prompts/failure-mode-serializer.ts, prompts/taxonomy-serializer.ts, lib/diagnosis/recommended-action.ts), but three foundational layers were never committed:
1. The data model. Missing type definitions and exports: FailureMode, FailureCostBand, FailureUrgency on the taxonomy; DiagnosticReasoning, RecommendedAction, DiagnosisFacets in features/diagnosis/types; the EXCLUDED_SERVICES constant; the buildSystemInstructionV2 builder; a facets field on the classification result; and an agent-reasoning member on PipelineStepName.
2. The content. Each of the roughly 86 taxonomy subcategories needs a failureModes array authored (the real list of likely failure modes per fault, with urgency and cost band). This is the bulk of the work and it is content authoring, not just typing.
3. The wiring. agent-reasoning is not called by the live /api/diagnose route or the processing orchestrator, so the feature is dormant and does not run in production.
Good news: because it is dormant, the live diagnosis pipeline is unaffected. It still runs rate-limit then classify then prose, exactly as the integration test pins. So this is incomplete scaffolding sitting in the tree, not a broken live feature. Options are to finish all three layers (large, mostly content), or remove the dormant scaffolding and its tests to get the codebase clean. Left for a dedicated decision. This is a product decision for whoever owns the diagnosis pipeline, not test work. The app appears to run because Next builds with esbuild, which strips types and does not fail on type errors. Recommended next step: decide to finish or revert that feature, then fix or delete the Group A tests to match.
- Dead backup directory: src/components/ui.backup-20260529-141207 contains stale files (for example chart.tsx) that contribute about 3 type errors. It is dead code and should be deleted or excluded from tsconfig.
- A few demo and showcase pages (showcase, design, branding, favourites, trades) also carry small numbers of type errors, unrelated to tests. Worth a separate cleanup pass.
- Database test harness: a Supabase branch (preferred, no Docker) or local Supabase via the CLI (needs Docker) is required before any RLS, trigger, or concurrency test can run. Targeted for roughly two weeks out.
- CI typecheck of test files: vitest does not typecheck, so a separate tsc step (or a lint rule) is needed to stop type drift returning. Added in T0.
- Diagnosis type drift (Group A) implies the production diagnosis types were refactored without updating tests. Worth a short review with whoever owns that module to confirm the removed fields (facets and the reasoning types) are intentional and not a regression.
- e2e build-error blocker around contents-builder.ts line 147 is reported but unconfirmed. Confirm before relying on the homeowner start-to-report e2e path.
- A few shared-component filenames from the source survey need confirming before their tests are written.
- Coverage thresholds in vitest.config.ts should be ratcheted upward at the end of each phase, never lowered.
- Money formatting reality check (found in T1): formatZar uses the en-ZA locale, which on this runtime outputs a space thousands separator and a comma decimal, for example "R 1 234,56", not the "R 1,234.56" suggested by the code comment. The tests now lock the real output. If a comma-thousands, dot-decimal style is actually wanted on invoices and quotes, that is a deliberate formatting change to make, not a bug to fix silently.

#### How To Read This Plan

Priority bands used throughout:

- P0: money, authentication, authorisation, privacy and POPIA, or data integrity. A regression here is a security or compliance incident, not a cosmetic bug.
- P1: important business logic and user-facing flows that are not directly money or privacy.
- P2: low risk, read only, dev only, or presentational.

The Docker boundary: tests that only exercise JavaScript (pure functions, route handlers with the Supabase client mocked, React components with Testing Library) need no new tooling and are in scope now. Tests that prove real database behaviour (RLS cross-tenant isolation, trigger side effects, gap-free numbering under concurrency, foreign-key cascades) need a real Postgres. That work is documented in Part 5 and deferred until we are ready to run a Supabase branch or local stack.

## Part 1, Failing Tests And The Fix Plan

Eighteen test files currently fail `tsc --noEmit` with roughly seventy errors. Vitest does not typecheck, so these are green in CI today while quietly rotting. New tests will import the same broken helpers and stale types, so this must be cleared first. The failures cluster into four root causes.

#### Group A, Diagnosis Type And Export Drift (about 46 errors, 7 files)

Production types in the diagnosis feature were renamed, moved, or removed, and the tests still reference the old shapes. Affected files:

- src/features/diagnosis/__tests__/agent-classify-facets.test.ts (15): references a `facets` property that no longer exists on ClassificationResult.
- src/__tests__/diagnostic-reasoning/runner.test.ts (14): imports `DiagnosisFacets`, `DiagnosticReasoning`, `RecommendedAction` which are no longer exported from `@/features/diagnosis/types`, plus several implicit-any callback parameters.
- src/lib/diagnosis/__tests__/failure-modes.test.ts (9): missing `FailureMode` type and a `failureModes` property.
- src/lib/diagnosis/__tests__/recommended-action.test.ts (2): missing `DiagnosticReasoning`, `RecommendedAction`, `DiagnosisFacets`.
- src/__tests__/diagnostic-accuracy/types.ts (2) and runner.test.ts (2): missing `FailureCostBand`, `FailureUrgency`, and `failureModes`.
- src/features/diagnosis/__tests__/taxonomy-serializer.test.ts (1): missing `EXCLUDED_SERVICES`.
- src/features/diagnosis/__tests__/v2-prompt-drift.test.ts (1): missing `buildSystemInstructionV2`.

Fix plan: this is a reconciliation task, not a rewrite. For each missing symbol, read the current production module to find the new name or location, then update the test import or assertion. Where a field was genuinely removed (for example `facets`), decide with the diagnosis owner whether the test still describes desired behaviour: update it to the new shape, or delete it if the behaviour is gone. Add explicit parameter types to the diagnostic-reasoning callbacks to clear the implicit-any errors. Effort: medium. This is the bulk of the debt and needs care because it touches the diagnosis pipeline, which is otherwise well covered and must stay that way.

#### Group B, Test Harness Type Drift (about 17 errors, 8 files)

The shared request and Supabase mock helpers drifted from the Next.js 16 request and response types. Affected files:

- src/__tests__/helpers/route-test.ts (2): `RequestInit.signal` is typed `AbortSignal | null` but the Next request expects `AbortSignal | undefined`; a `PromiseLike.then` signature mismatch in the mock query builder.
- src/lib/providers/__tests__/handler-places-client.test.ts (5) and handler.integration.test.ts (2): the same RequestInit mismatch plus tuple-length errors in the Places mock.
- src/lib/api/__tests__/validation.test.ts (1): RequestInit mismatch.
- src/app/api/cron/contractor-onboarding/route.test.ts (4): a NextRequest passed where Request is expected.
- src/app/api/diagnose/__tests__/route.integration.test.ts (1): Response versus NextResponse.
- src/app/api/contact/route.test.ts (1): a handler called with one argument where zero are expected.
- src/app/api/contact/contractor/route.test.ts (1): spread argument is not a tuple.

Fix plan: fix this once at the source in src/__tests__/helpers/route-test.ts. Update the request builder to construct the current NextRequest type (normalise `signal` to `undefined`, return the right Response subtype), and type the mock query builder so its `then` matches PromiseLike. Tighten the Places mock tuple typing. Most of the downstream file errors disappear once the helper is correct. Then fix the two contact route tests and the cron test to call handlers with the current signatures. Effort: medium, but high leverage because it unblocks all future route tests.

#### Group C, Stale Suppression Directives (4 errors, 1 file)

- src/__tests__/setup-dom.ts (4): four `@ts-expect-error` directives that are no longer needed because the jsdom polyfills they guarded now typecheck cleanly.

Fix plan: delete the four directives. Effort: trivial.

#### Group D, Component Session Typing (2 errors, 1 file)

- src/components/__tests__/auth-card.dom.test.tsx (2): a null Supabase Session is not assignable to the expected type in the mock.

Fix plan: type the mocked session as nullable, or cast through the Supabase Session type the component expects. Effort: trivial.

#### Suggested order for Part 1

1. Group C and Group D first (trivial, immediate green).
2. Group B next (unblocks all future route-contract tests).
3. Group A last (largest, needs the diagnosis owner to confirm intended behaviour for removed fields).

After Part 1, add a CI step that runs `tsc --noEmit` (or at least typechecks the test directories) so this debt cannot silently return.

## Part 2, What Is Already Covered

Recorded so we do not duplicate it.

- Diagnosis pipeline: classification parsing, finalisation, critique, prose, hedging guard, taxonomy, structural confidence, recommended action, plus fixture-based accuracy and reasoning eval runners. Strong, once the Group A type drift is fixed.
- Provider matching: ranking, relevance, service-area filter, distance, query builder, review ingestion and normalisation, fast review summary, open-status (partly), cache. Deep.
- Public and homeowner API routes: contact, waitlist, beta-access, diagnose (with an integration test pinning the call order), most providers and diagnoses routes, account exists checks. Route-contract tests cover auth, validation, happy path, and errors.
- Utilities: rate-limit enforcement, phone normalisation (partly), safe-redirect, services, admin-auth audit of buckets, parse-diagnosis, email utils.
- Shared harness: a flexible Supabase mock builder, an MSW server, and Resend, Gemini, and Redis mocks, all reusable for new tests.

## Part 3, Coverage Gaps By Layer

This is the documentation of everything that needs a test. Items are grouped by layer and tagged with priority and the specific behaviours to cover.

#### API Routes

The Pro portal routes are all untested and are the top priority.

Pro portal, all P0 or P1, all untested:

- pro/invoices and pro/invoices/[id] (P0): create draft, create from accepted quote (copies customer, items, totals, VAT, deposit, terms), issue assigns a gap-free INV number and locks the record, editing an issued invoice returns 409, record-payment math and rounding, status transitions draft to sent to partial to paid, VAT applied only when the provider is VAT registered. Cross-tenant: provider B cannot read or modify provider A invoices.
- pro/quotes and pro/quotes/[id] (P0): per-provider quote numbering, status enum and first-transition timestamps, line-item totals and VAT, quote-to-invoice handoff, cross-tenant rejection.
- pro/claim (P0): cannot claim while already running a business, at most one pending claim per user, one pending claim per provider, provider must exist and be unclaimed and unmerged, the claim creates a pending row for admin review and does not set ownership directly.
- pro/members and pro/members/[id] (P1): invite requires owner or admin, email validation, duplicate-invite detection, seat-limit enforcement from the plan, immediate link of an existing user versus pending invite, change-role is owner only and the owner row is immutable, remove respects owner-immutable and admin-cannot-remove-admin.
- pro/plan (P1): GET returns plan and seat usage, PATCH is owner only, unknown plan rejected, downgrade guard refuses to drop below current seat usage.
- pro/leads/[id] (P1): status enum, notes length cap, cross-tenant rejection, the won status best-effort auto-creates a job and is idempotent on the originating lead.
- pro/jobs and pro/jobs/[id] (P1): title required and length caps, status enum, completed-at stamping, cross-tenant rejection.
- pro/customers and pro/customers/[id] (P1): tenant scoping, field validation, partial update.
- pro/settings (P1): GET returns role, profile edits restricted to owner or admin, notification preferences upsert allowed for any teammate, field validation for callout fee, quiet hours range, and channel enum.
- pro/providers/search (P2): authenticated, returns only unclaimed active providers with lead counts.

Account and POPIA routes, untested:

- account/delete (P0): re-auth by typed email, rejects anonymous accounts, admin delete cascades.
- account/export (P0): exports profile, diagnoses, saved providers, and contact history as a download.
- account/data-consent (P0): defaults, upsert, boolean validation.
- account/consents and account/consents/revoke (P1): list dedupes by provider, revoke stamps revoked_at for the right homeowner and specialist only.
- account/avatar (P0): MIME and magic-byte validation, size cap, storage path, syncs profiles and auth metadata, delete clears both.
- account/password (P0): re-auth with current password, minimum length, must differ, rejects anonymous accounts.
- account/profile, account/phone, account/consent-settings, account/notification-preferences (P1): field caps, SA phone validation and normalisation, enum and at-least-one-field rules.

Other untested routes:

- admin/claims PATCH (P1): the approval path that sets claimed_by_user_id, plus rejection.
- admin/ai-pricing (P1): admin gate, closes the previous active row and inserts a new one, invalidates the pricing cache, source enum.
- admin/beta-codes (P2): CRUD validation and redemption stats.
- contractors/account/service-area (P1): Western Cape bounds, radius bounds, plan-gated radius enforcement, requires a matched provider.
- contractors/reviews/[id]/reply (P2): cross-tenant check on the reviewed provider.
- providers/search (P2): min query length, Google fallback, source badge.
- diagnose/refinement (P2), processing-averages (P2), cron/feature-announcement and cron/prune-ai-call-log (P2), whatsapp/simulator and profiles (P2, dev only), account/saved-providers/list (P2).

#### Library And Business Logic

Pure functions, cheap and high value, all untested unless noted. All testable now with no tooling.

- pro/plans.ts (P0): toPlanId defaulting, isPlanId, planLimits values for each tier.
- format-money.ts (P0): ZAR formatting, decimals, negatives, non-finite inputs.
- format-date.ts (P0): Today, Yesterday, N Days Ago, the older-than-a-week date form, year omission, invalid input.
- phone.ts (P1): mobile versus landline detection, local versus international normalisation, input formatting, validation.
- providers/claimed-provider.ts (P0): the three-way resolution order (direct claim, then approved application, then active membership), skipping merged providers, and getProviderRole returning owner for the claimer and the membership role otherwise. This module gates access control on every Pro page, so it is the highest-value lib test. It needs the Supabase mock.
- auth/admin-auth.ts (P0): token creation, expiry parsing, signature verification, tampered and malformed tokens, constant-time comparison.
- auth/cron-auth.ts (P0): exact bearer match, missing or wrong secret.
- rate-limit-config.ts (P0): caller IP extraction from headers, bypass logic, bucket config sanity.
- auth/supabase-server.ts (P0): admin client versus server client selection and caching. Note: asserting that the admin client truly bypasses RLS is a Docker-required DB test (Part 5); the client-selection logic itself can be unit tested.
- diagnosis/trade-resolver.ts (P1): label then service then anchor precedence, N/A and empty handling.
- providers/open-status.ts (P1): in-range, out-of-range, 24 hours, closed, overnight ranges, dash variants, day-name prefixes.
- providers/provider-profile-clean.ts (P1): entity decode, tag strip, dedupe, low-signal detection.
- diagnosis/parse-diagnosis-from-model-response.ts (P1): markdown-fence and trailing-JSON fallback, malformed input.
- whatsapp/session-manager.ts (P1): get, get-or-create with the insert-then-reread race, touch behaviour. Needs the Supabase mock.
- notify-contractor-of-lead.ts (P0, partly covered): close the gaps on the opt-out default, suppression list, and inactive or missing email.

A longer tail of P2 modules (AI client wrappers, prompt templates, DB-query helpers, analytics, summaries) is lower value and mostly needs integration mocking; list maintained in the matrix above and tackled last.

#### UI, Pages, Components, Clients

All Pro portal client components are untested (14): claim, leads and lead detail, jobs and detail, customers and detail, quotes and detail, invoices and detail, team, plan, settings. For each, cover form submission, optimistic update then error recovery, role-gated buttons (for example canManage on plan and team), dialogs, and error toasts. P0 for the money and access-control screens (invoices, quotes, plan, team, claim), P1 for the rest. Testable now with Testing Library and MSW.

All Pro portal pages are untested (server components): the auth redirect when signed out, the no-provider empty state, the pending-claim state, and role gates. P0 for home, leads, invoices, quotes, plan, team, claim. These can be tested by mocking the resolver and auth.

Pro auth pages (login, register, forgot) and the interactive shared components are untested: pro-tab-bar (active-tab resolution and the More popover), the contact-consent dialog (POPIA copy, confirm and cancel), the auth-prompt and gate dialogs, address-autocomplete, save-provider-button, user-avatar. P0 or P1 as marked. Some specific component filenames in the source survey need confirmation before writing the tests.

#### End To End Flows

All six e2e specs carry skip or fixme markers, so the suite is heavily gated today. The active coverage is the homeowner start screen on desktop and mobile and the short-circuit on vague descriptions. Missing critical flows:

- The full Pro lifecycle: claim, approval, lead, won, job, quote, accept, invoice, issue, payment. P0.
- Team invite and role enforcement. P0.
- Plan upgrade with seat and radius enforcement. P0.
- The homeowner consent and POPIA gate on the contact flow. P0.
- Contractor onboarding end to end and auth persistence. P1.

Most of these need a signed-in user and real data, so they belong in the Docker-required phase. The homeowner consent gate and the start-to-report path may be reachable with mocks; one reported blocker, a build error around contents-builder.ts line 147, needs confirmation before relying on that path.

#### Database Layer

No database-level tests exist. These prove behaviour the JavaScript mock cannot, and all require a real Postgres (Part 5). Recorded here for completeness:

- Cross-tenant RLS isolation across every Pro table (provider_customers, jobs, quotes, quote_items, invoices, invoice_items, credit_notes, provider_branding, lead_states, provider_members), plus owner-only reads on provider_claims and per-user rows on the consent tables.
- next_invoice_seq atomicity: concurrent calls for one provider produce consecutive, gap-free integers, and numbering is per-provider.
- get_user_id_by_email SECURITY DEFINER lockdown: anon and authenticated callers are denied; only the service role can call it.
- The link_pending_provider_members signup trigger: exact case-insensitive email match links the right invites and nothing else.
- The set_primary_trade trigger and canonical_primary_trade function: canonical detection and the COALESCE preserve-on-update behaviour.
- CHECK constraints (status enums, plan, channel, quiet hours), unique constraints (one pending claim per provider and per user, one job per lead, one membership per teammate), and foreign-key behaviour on account deletion (diagnoses and provider_members set null, consents and notification prefs cascade, audit logs untouched).
- Application-only immutability gaps worth noting: issued-invoice and accepted-quote number immutability is enforced in app code, not the database, so a rogue service-role write is not blocked at the DB. Consider a trigger later.

## Part 4, Sequenced Build Plan, No Docker Required

This is the work to do now. Each phase is independently shippable.

#### Phase T0, Stabilise (do first)

Clear Part 1. Fix Groups C and D, then B, then A. Add a typecheck step for the test directories so the debt cannot return. Outcome: the suite typechecks clean and the route-test helper is solid for everything that follows.

#### Phase T1, Pure-Logic Unit Tests

plans, format-money, format-date, phone, rate-limit-config, auth/admin-auth, auth/cron-auth, trade-resolver, open-status, provider-profile-clean, parse-diagnosis. Fast, no mocks for most. Biggest coverage-per-hour.

#### Phase T2, Resolver And Pro Route Contracts

claimed-provider (with the Supabase mock), then the Pro route handlers: invoices and invoices/[id], quotes and quotes/[id], claim, members and members/[id], plan, leads/[id], jobs, customers, settings. For each: unauthenticated returns 401, wrong role returns 403, cross-tenant access returns 404, bad input returns 400, and the business-logic happy paths and 409 guards. This is the core P0 revenue and access-control coverage and it all runs against the existing mock harness.

#### Phase T3, Account And POPIA Route Contracts

delete, export, data-consent, consents and revoke, avatar, password, profile, phone, consent-settings, notification-preferences. Then admin/claims PATCH, admin/ai-pricing, and contractors/account/service-area.

#### Phase T4, Pro UI Component Tests

Testing Library and MSW for the Pro client components, starting with invoices, quotes, plan, team, and claim, then the rest. Cover submit, optimistic update and error recovery, role-gated buttons, dialogs, and toasts. Add the interactive shared components (pro-tab-bar, consent dialog, auth-prompt) and the Pro page empty and pending states by mocking the resolver.

#### Phase T5, Remaining Lib And P2 Tail

whatsapp/session-manager, notify-contractor gaps, then the P2 utilities and read-only routes as time allows.

## Part 5, Deferred, Needs Docker Or A Supabase Branch

Out of scope until we are ready to run a real Postgres. Expected within roughly two weeks per the current decision.

- All database-layer tests in Part 3 (RLS isolation, next_invoice_seq atomicity, SECURITY DEFINER lockdown, triggers, constraints, cascades).
- The end-to-end Pro lifecycle, team invite, plan enforcement, and auth-persistence specs that need a signed-in user and seeded data.
- Any test asserting that the admin client genuinely bypasses RLS while the server client enforces it.

When we pick this up, the lightest path is a Supabase branch (an ephemeral real database with real auth) driven by the existing Supabase client from vitest, rather than installing pgTAP. Local Supabase via the CLI is the Docker-based alternative. A small set of pgTAP SQL tests for the pure functions and constraints can be added later if we want defence in depth.

## Part 6, Conventions And Harness Notes

- Reuse src/__tests__/helpers/route-test.ts for route handlers: it builds a NextRequest and gives a chainable Supabase mock. Fix it in T0 before leaning on it.
- Component tests use Testing Library with the jsdom environment (file name ending in .dom.test.tsx or placed under a __tests__/components path, per environmentMatchGlobs in vitest.config.ts) and the MSW server in src/__tests__/msw.
- Keep route tests to the observable contract (status code, body shape, and the calls made through the mock), mirroring the existing diagnose integration test.
- Do not lower the coverage thresholds in vitest.config.ts; each phase should ratchet them up.
- Follow the repo style: single quotes, four-space indent, run prettier and eslint on new test files.
