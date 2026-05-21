# Launch Checklist

This document is the authoritative pre-launch checklist for Menda. Items marked `[x]` have been verified as implemented in the codebase. Items marked `[ ]` are not yet complete. Each item states what file or system it touches and enough context to act on it without re-reading the codebase.

**Checklist status:** Last verified against the codebase on 20 May 2026.

---

## Phase 1 — Public Beta

Every item in this phase must be complete before a real user is onboarded.

---

### [x] Atomic diagnosis quota check

**File:** `src/app/api/diagnose/route.ts` → calls `increment_diagnosis_quota` RPC  
The quota increment is an atomic database function (`INSERT ... ON CONFLICT DO UPDATE RETURNING count`). A concurrent double-tap cannot cause both requests to pass the same counter value. The RPC is defined in `supabase/migrations/20260512000000_atomic_quota.sql`.

---

### [x] Error monitoring (Sentry)

**Files:** `src/instrumentation.ts`, `src/app/global-error.tsx`  
Sentry is initialised for both the Node.js and Edge runtimes via the Next.js instrumentation hook. `global-error.tsx` catches root-layout errors and reports them to Sentry with a retry CTA. Enabled in production only (`NODE_ENV === 'production'`). Requires `NEXT_PUBLIC_SENTRY_DSN` to be set in Vercel.

---

### [x] Distributed rate limiting (Upstash Redis)

**File:** `src/lib/rate-limit.ts`  
Rate limiting uses Upstash Redis in production, falling back to a process-local in-memory store for local development. The in-memory fallback is documented in the file. Rate limit buckets are defined in `src/lib/rate-limit-config.ts`. All public API routes call `checkRateLimit` as their first operation.

---

### [x] Rate limit buckets wired to routes

**File:** `src/lib/rate-limit-config.ts`  
All active routes have a corresponding bucket: `diagnose`, `providers`, `geocode`, `enrich*`, `uploadImage`, `transcribe`, `validateStartDescription`, `analyticsEvents`, `providerApply`, `heicConvert`, `contactForm`, `contractorWaitlist`, `reviews`, `reviewsCount`, `restoreToken`, `conversationLocation`, `conversationRead`, `conversationUpsert`, `applicationEdit`, `whatsappMessage`, `directions`, `onboardingSearch`, `onboardingPlaceDetails`, `providerApplicationUpload`, `syncGallery`.  
**Note:** `partsPrices` and `marketRates` buckets were removed when cost estimation was stripped.

---

### [x] Content Security Policy and security headers

**File:** `next.config.ts`  
`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy` are set on all responses. Review the CSP when new external scripts or fonts are added — a new domain must be explicitly allowlisted.

---

### [x] Global React error boundary

**File:** `src/app/global-error.tsx`  
Catches any error that escapes route-level boundaries, including root layout errors. Renders a user-facing message with a retry button and the error digest for support correlation.

**Note:** There is no `src/app/error.tsx` at the root level — only `global-error.tsx`. Consider adding a root `error.tsx` to give route-level errors a branded fallback page rather than the bare global boundary.

---

### [x] Structured logging for the diagnosis pipeline

**Files:** `src/features/diagnosis/agent-classify.ts`, `src/features/diagnosis/agent-prose.ts`, `src/features/diagnosis/processing-orchestrator.ts`  
Every pipeline step emits a `logPipelineStep` call (from `@/lib/ai/ai-logging`) with `conversationId`, `userId`, `stepName`, `durationMs`, `status`. All Gemini calls follow with `logGeminiUsage` (from `@/lib/ai/ai-cost-logger`). Logs are queryable in Vercel's log drain.

---

### [x] AI cost tracking

**Files:** `src/lib/ai/ai-cost-logger.ts`, admin dashboard at `/admin/analytics`  
Token counts and estimated cost are logged to `ai_cost_events` on every Gemini call. The admin panel shows daily totals. Requires `GEMINI_API_KEY` to have a spending limit set in Google Cloud Console — verify this before going live.

---

### [x] Row Level Security on all tables

**Verified via Supabase MCP on 20 May 2026:**
- `providers` — public read with `is_active AND (source = 'google' OR is_verified = true)` gate; write restricted to service role
- `provider_applications` — anon insert only; read restricted to service role
- `contact_messages` — anon insert only; read restricted to service role
- `diagnoses` — users read/write their own rows; service role for pipeline writes
- `conversations` — users read/write their own rows
- All other tables: RLS enabled

---

### [x] Provider visibility gate (application-sourced providers)

**File:** `supabase/migrations/20260520000004_provider_verification_gate.sql`  
`is_verified boolean NOT NULL DEFAULT false` added to `providers`. All 476 existing Google-sourced providers backfilled to `is_verified = true`. The public select policy requires `source = 'google' OR is_verified = true` — application-sourced providers are invisible to homeowners until an admin verifies them.

---

### [x] POPIA and terms of service

**Files:** `src/app/terms/content.tsx`, `src/app/privacy/content.tsx`  
The privacy policy explicitly references POPIA (Protection of Personal Information Act 4 of 2013), names an Information Officer, and covers data retention, cross-border transfers, and user rights. The terms of service disclaim AI-generated output and note legal limitations (no substitute for professional inspection). Legal copy status:

- `[ ]` **Operator legal details are marked `UNPUBLISHED` in `src/lib/site-legal.ts`.** The physical address, postal address, and legal email must be filled in before going live — they appear in multiple places in the terms and privacy policy with a placeholder.

---

### [x] Dead file and dead route cleanup

The following files and directories have been confirmed deleted:

| Previously listed | Status |
|---|---|
| `src/app/diagnosis2/` | Deleted |
| `src/app/landing/` | Deleted |
| `src/app/landing1/` | Deleted |
| `src/features/match/hooks/useMatchConversationContext.ts` | Deleted |
| `src/features/match/hooks/useMatchMap.ts` | Deleted |
| `src/features/match/hooks/useMatchProviders.ts` | Deleted |
| `src/app/contractors/_components/` | Deleted |
| `src/app/contractors/_lib/` | Deleted |
| `src/app/contractors/_types/` | Deleted |
| `src/app/contractors/_constants/` | Deleted |
| `src/app/page/_components/` | Deleted |
| `src/app/api/market-rates/` | Deleted (cost estimation removed) |
| `src/app/api/parts-prices/` | Deleted (cost estimation removed) |
| `src/lib/market-rates/` | Deleted |
| `src/lib/parts-prices/` | Deleted |
| `src/components/beta-cost-estimate-card.tsx` | Deleted |
| `src/lib/fetch-services.ts` | Deleted |
| `src/app/api/diagnose/cost/` (if existed) | Deleted |

**Remaining:** `src/app/chat/components/` still exists and contains `providers-map.tsx` (imported by `src/app/contractors/[id]/components/map.tsx`) and `types.ts`. This is not dead — it is a shared component that happens to live under the former chat directory. Consider moving `providers-map.tsx` to `src/components/` to eliminate the misleading path.

---

### [x] CLAUDE.md is accurate

**File:** `CLAUDE.md` in repository root  
**Note:** CLAUDE.md still references `lib/market-rates/`, `lib/parts-prices/`, and `app/chat/` as active features. Update these before the next session where an AI assistant is used — stale CLAUDE.md entries cause misdirected refactoring.

---

### [ ] Fill in operator legal details in `site-legal.ts`

**File:** `src/lib/site-legal.ts`  
The `LEGAL_DETAILS_UNPUBLISHED` placeholder appears in the terms of service and privacy policy in multiple places (operator legal name, physical address, postal address, legal email). These must be completed before any public-facing use of the site.

---

### [ ] Confirm API keys are scoped for production

**System:** Google Cloud Console, Brave Search dashboard, Vercel environment config  
Before any user hits the app, verify:
- Gemini API key has a monthly spending cap set in Google Cloud Console
- `ADMIN_PASSWORD` is a strong random string (not a development placeholder)
- No development or test keys are present in Vercel production environment variables
- `NEXT_PUBLIC_SENTRY_DSN` is set in Vercel production

---

### [ ] Bump `AI_PROVIDER_ENRICHMENT_VERSION` to `2` in Vercel

**System:** Vercel environment variables  
**Why this matters:** The enrichment pipeline was broken for approximately 6 weeks due to a schema mismatch. All providers written during that period have incomplete or corrupt enrichment data. Bumping this environment variable causes the pipeline to treat all providers as needing re-enrichment, triggering a full pass through the fixed pipeline.

Action: In Vercel → Settings → Environment Variables, set `AI_PROVIDER_ENRICHMENT_VERSION=2`. The change takes effect on the next deployment.

---

### [ ] Resolve Supabase storage quota

**System:** Supabase Storage (support ticket filed 20 May 2026)  
The `gallery/providers/` bucket contains 13,091 files from enrichment. The project is over the free-tier storage quota, which is preventing new file uploads. Provider image rows in `provider_images` have been deleted. The physical files remain in storage pending Supabase support resolution.

Once resolved:
- The enrichment pipeline will re-populate provider images automatically on the next enrichment run (guarded by `count > 0 → skip` so only missing images are added; no duplicates)
- Confirm the UUID-based folder (`gallery/e74ce9bc.../`) and `vault/` (143 files) are also cleared

---

### [ ] Smoke test the full homeowner journey end-to-end

**Severity: High — must be done on a real mobile device (iOS Safari + Android Chrome)**

Walk the complete flow manually before any real user does:

1. Land on homepage → click "Start"
2. Enter a description on `/start` — verify quality check passes/fails correctly
3. Upload a photo on `/diagnosis` — test with HEIC to verify lazy-load conversion works
4. Watch `/processing` animate through all steps
5. Read the report on `/report/[id]` — verify diagnosis renders, trade matches, no console errors
6. See contractor matches on `/match` — verify the map loads, filters work, at least one provider appears
7. Open a contractor profile on `/contractors/[id]` — verify gallery, reviews, and map render
8. Attempt to exceed the daily quota — verify 429 response and correct error message
9. Log out and log back in — verify session is cleared and restored correctly
10. Submit a WhatsApp contact request from `/match` — verify the message is pre-filled correctly

---

### [ ] Admin: verify at least one application-sourced provider can be verified

**File:** `src/app/admin/providers/client.tsx`  
The `is_verified` flag was added to prevent application-sourced providers from appearing to homeowners before manual review. Confirm the admin `/admin/providers` page exposes a way to set `is_verified = true` for a specific provider. If no such control exists, add it before any contractor application is submitted.

---

## Phase 2 — Public Launch

These items must be resolved before opening registration to the general public — after a closed beta period validates the core flow.

---

### [ ] Add root-level `error.tsx`

**File:** `src/app/error.tsx` (does not yet exist)  
`global-error.tsx` catches root-layout errors, but route-level errors (thrown in a page or client component) currently have no branded fallback — they produce a blank screen in production if no closer `error.tsx` exists. Add a root `src/app/error.tsx` with the same design as `global-error.tsx` but without the `<html>/<body>` wrapper.

---

### [ ] Database backup runbook

**System:** Supabase dashboard, internal documentation  
Confirm Supabase point-in-time recovery (PITR) is enabled on the production project (requires a paid plan). Write a one-page runbook that documents how to restore from a backup. This is a 30-minute task that removes a category of existential risk.

---

### [ ] Accessibility audit of the core homeowner flow

**Scope:** `/start` → `/diagnosis` → `/processing` → `/report/[id]` → `/match`  
Run Axe DevTools or Lighthouse on each page and address:
- All images have `alt` text
- All interactive elements are keyboard-navigable
- Colour contrast ratios meet WCAG 2.1 AA minimums (especially text on dark card backgrounds)
- The file upload on `/diagnosis` works without a mouse

---

### [ ] SEO: sitemap and canonical URLs

**Files:** `src/app/sitemap.ts`, `src/app/robots.ts`  
Confirm the sitemap includes all public-facing routes and excludes all admin, API, and auth routes. Verify canonical tags are set correctly. Test with Google Search Console URL inspection.

---

### [ ] Load test the diagnosis endpoint

**File:** `src/app/api/diagnose/route.ts` (`maxDuration: 60`)  
The diagnosis route chains a DB write, up to 5 image uploads, two sequential Gemini calls, and a second DB write within one serverless function. Run 10 concurrent requests to verify p95 latency stays within the time limit and the rate limiter correctly throttles excess traffic.

---

### [ ] Review the contractor application flow end-to-end

**Flow:** `/contractors` → `/contractors/network` → `POST /api/providers/apply` → `application/edit` (token link)

The contractor application is the primary supply-side onboarding flow. It is not a "Claim Your Profile" feature — there is no Google Business–style claiming mechanism. A contractor fills out the application, the system creates a `provider_applications` row (and optionally a `providers` row), and an admin must set `is_verified = true` before the provider appears to homeowners.

Verify end-to-end:
1. Submit an application from `/contractors/network`
2. Confirm the `provider_applications` row is created in Supabase
3. Confirm the provider is not visible on `/match` (requires `is_verified = true`)
4. Use the admin panel to set `is_verified = true`
5. Confirm the provider now appears on `/match` for a relevant trade search

---

### [ ] Enrichment quality validation

**File:** `src/lib/providers/provider-enrichment.ts`  
After bumping `AI_PROVIDER_ENRICHMENT_VERSION` to 2 and the enrichment pipeline re-runs, query the live database to validate output quality:

```sql
SELECT
    COUNT(*) FILTER (WHERE enrichment_quality = 'ok') AS ok,
    COUNT(*) FILTER (WHERE enrichment_quality = 'low') AS low,
    COUNT(*) FILTER (WHERE enrichment_quality IS NULL) AS not_enriched,
    COUNT(*) FILTER (WHERE scrape_status = 'failed') AS failed
FROM providers
WHERE source = 'google';
```

Expected: the majority of 476 providers reach `enrichment_quality = 'ok'` or `'low'`. More than 20% remaining `null` after a full enrichment pass indicates a pipeline bug requiring investigation.

---

## Testing Requirements

These tests must exist and pass before Public Beta. Writing them is part of the pre-launch scope — passing CI is a necessary but not sufficient condition; tests must verify user-visible behaviour, not just internal logic.

---

### Unit tests — existing (passing)

The following test files exist and are expected to remain passing:

| File | What it covers |
|---|---|
| `features/diagnosis/__tests__/processing-orchestrator.test.ts` | `shouldSkipDiagnosisPipeline`, `buildDiagnosisVersion`, `isDiagnosisAccurateForPrefetch`, `PROCESSING_STEP_ORDER` |
| `features/diagnosis/__tests__/composer.test.ts` | Diagnosis NDJSON stream composer |
| `lib/__tests__/parse-diagnosis.test.ts` | `parseDiagnosisFromModelResponse` — all edge cases |
| `lib/__tests__/safe-redirect.test.ts` | `safeRedirect` — open redirect prevention |
| `lib/__tests__/admin-auth.test.ts` | `requireAdmin` — password validation |
| `lib/diagnosis/__tests__/diagnose-ndjson-stream.test.ts` | NDJSON streaming protocol |

---

### [ ] Unit tests — required before beta

| Module | Tests needed |
|---|---|
| `src/lib/providers/provider-enrichment.ts` | Fast path (summary-only) returns `scrape_status: 'fast_only'` and does not set `enriched_at`; full path returns `scrape_status: 'ok'` and sets `enriched_at`; Supabase upsert error returns `{ ok: false }`; geographic filter rejects providers outside SA bounding box |
| `src/lib/rate-limit-config.ts` | `isRateLimitBypassed` returns true when `DISABLE_RATE_LIMIT=true`; IP extraction handles `x-forwarded-for` with multiple IPs correctly |
| `src/lib/diagnosis/parse-diagnosis-from-model-response.ts` | Additional edge cases: malformed JSON, missing required fields, extra unknown fields |
| `src/features/diagnosis/agent-classify.ts` | Returns fallback classification when Gemini call throws; fallback has `requestFailed: true` |

---

### [ ] Integration tests — required before beta

These tests verify that the core API routes behave correctly end-to-end. They should run against a real test Supabase database (not mocks) to catch schema/RLS issues that mock tests cannot detect.

| Route | Scenarios to cover |
|---|---|
| `POST /api/diagnose` | Returns 429 when rate limited; returns 429 when quota exceeded; returns 200 with streamed NDJSON on a valid request; rejects requests without an image |
| `POST /api/providers` (match search) | Returns providers filtered by trade and location; excludes providers where `is_verified = false` and `source != 'google'`; respects the SA geographic bounding box |
| `POST /api/providers/apply` | Creates a `provider_applications` row; rate-limits to 3 per hour per IP; does not create a visible `providers` row accessible to anon queries |
| `GET /api/cron/retry-enrichment` | Rejects requests without the cron secret; returns structured JSON with processed/skipped counts |

---

### [ ] End-to-end smoke test (automated)

Using Playwright or a similar framework, automate the critical homeowner path so it can be run in CI before each deployment:

1. Navigate to `/start`, enter a description, submit
2. Upload a test image on `/diagnosis`, submit
3. Wait for `/processing` to complete (poll for redirect)
4. Assert `/report/[id]` renders with a trade name and action_required field
5. Assert `/match` renders at least one provider card

This test can use a fixture Gemini response (mocked at the network level) to avoid real API costs in CI.

---

*Last updated: 20 May 2026. Owner: Matthew Prowse.*
