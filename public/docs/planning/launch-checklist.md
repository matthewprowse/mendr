# Launch Checklist

This document is the authoritative pre-launch checklist for Scandio. It is split into two phases: **Public Beta** (limited invite / soft launch) and **Public Launch** (open to all Western Cape homeowners). Every item includes the file or system it touches, a severity rating, and enough context to action it without re-reading the codebase.

---

## Phase 1 — Public Beta

These items must be resolved before the first real user is onboarded. A bug in this list is a bug that will happen in production on day one.

---

### - [x] Fix the atomic quota race condition

**Severity: Critical**  
**File:** `src/app/api/diagnose/route.ts`

The current quota check is a read-then-write: the route reads the user's usage count, checks it against the limit, and then increments it in a separate write. Two near-simultaneous requests — a double-tap, a network retry, two open tabs — can both pass the read check and both consume a credit. On a free-tier beta with a per-user daily quota, this will be exploited unintentionally on the first day.

**Fix required:** Create a Supabase database function `increment_diagnosis_quota` that performs the increment atomically using `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`. The route should call this RPC and only proceed if the returned count is within the limit. The read-then-write pattern must be removed entirely.

```sql
-- Migration: supabase/migrations/xxxx_atomic_quota.sql
CREATE OR REPLACE FUNCTION increment_diagnosis_quota(
  p_user_id uuid,
  p_date date
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO diagnosis_quotas (user_id, date, count)
  VALUES (p_user_id, p_date, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = diagnosis_quotas.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;
```

---

### - [x] Set up error monitoring

**Severity: Critical**  
**Files:** `src/app/layout.tsx`, new `src/lib/monitoring.ts`

There is currently no error monitoring in the application. Unhandled exceptions in server components, route handlers, and client components will be silently swallowed or surface as generic 500 pages. In a public beta you will find out about crashes through user support tickets, not dashboards.

**Fix required:** Install Sentry (or equivalent — LogRocket, Axiom, etc.). Configure it in `instrumentation.ts` for server-side errors and in the root layout for client-side errors. The minimum viable setup is:

- Source maps uploaded on build so stack traces are readable
- An error boundary at the root layout that catches React rendering errors
- Alerting on error rate spikes (Slack webhook or email)
- Capturing `userId` on all events so you can correlate errors to users

Without this, debugging production issues after launch will be significantly slower.

---

### - [x] Fix process-local rate limiting

**Severity: High**  
**File:** `src/lib/rate-limit.ts`

The current rate limiter uses a `globalThis` Map as its store. On Vercel's serverless runtime, each function invocation may run on a different instance with its own memory. A user who hits two different instances in the same window gets double the allowed quota. Under any meaningful traffic, the rate limits are effectively non-functional.

**Fix required:** Replace the in-memory store with a Supabase or Upstash Redis counter. The `checkRateLimit` function interface can stay identical — only the backing store changes. Upstash Redis with the `@upstash/ratelimit` package is the lowest-friction option for Vercel deployments and requires no schema migration.

If this is intentionally deferred for beta (acceptable), document it explicitly in `rate-limit.ts` so future developers understand the known limitation.

---

### - [x] Delete junk routes and dead files

**Severity: Medium**  
**Files listed below**

These files add noise to the route tree and create confusion. None are import targets for live code.

| File | Action | Reason |
|---|---|---|
| `src/app/diagnosis2/page.tsx` | Delete | Redirect stub, not a real route |
| `src/app/page/_components/testimonials-section 3.tsx` | Delete | Space in filename — Finder duplicate artifact, will break Linux CI |
| `src/app/landing/` (entire directory) | Delete | Orphaned experiment; `page.tsx` imports from `page/components/`, not here |
| `src/app/landing1/` (entire directory) | Delete or make `/beta` redirect | If `landing1` is the active marketing page, rename it. If not, delete it. |
| `src/features/match/hooks/useMatchConversationContext.ts` | Delete | Duplicate of `use-match-conversation-context.ts`; zero imports |
| `src/features/match/hooks/useMatchMap.ts` | Delete | Duplicate of `use-match-map.ts`; zero imports |
| `src/features/match/hooks/useMatchProviders.ts` | Delete | Duplicate of `use-match-providers.ts`; zero imports |
| `src/app/contractors/_components/` (entire dir) | Delete | Zero imports; parallel to `contractors/components/` |
| `src/app/contractors/_lib/` (entire dir) | Delete | Zero imports; parallel to `contractors/lib/` |
| `src/app/contractors/_types/` (entire dir) | Delete | Zero imports; parallel to `contractors/types/` |
| `src/app/contractors/_constants/` (entire dir) | Delete | Zero imports; parallel to `contractors/constants/` |
| `src/app/page/_components/` (entire dir) | Delete | Zero imports; parallel to `page/components/` |

---

### - [x] Verify rate-limit buckets are wired to their routes

**Severity: Medium**  
**Files:** `src/lib/rate-limit-config.ts`, all `src/app/api/**/*route.ts`

Six new rate-limit buckets were added in a prior wave (`analyticsEvents`, `providerApply`, `partsPrices`, `heicConvert`, `contactForm`, `contractorWaitlist`). Verify each bucket is actually called in its corresponding route handler with `checkRateLimit(req, 'bucketName')`. A bucket defined but never applied is silently non-functional.

Run a grep to confirm:

```bash
grep -rn "checkRateLimit" src/app/api/ | sort
```

Each of the six new bucket names should appear at least once.

---

### - [ ] Review terms of service and privacy policy for AI-generated content

**Severity: Medium**  
**Files:** `src/app/terms/content.tsx`, `src/app/privacy/content.tsx`

The app generates AI diagnosis reports and shows them to homeowners who may act on them financially. The terms of service must explicitly disclaim that the diagnosis is AI-generated, is not a qualified professional assessment, and should not be relied upon for legal, insurance, or safety-critical decisions. Confirm with a lawyer that the current copy meets this bar. This is a reputational and potential liability issue on day one of a public beta.

---

### - [ ] Confirm Gemini and Brave Search API keys are scoped correctly

**Severity: Medium**  
**Files:** `src/.env.production`, Vercel environment config

Before launch, audit that:
- The Gemini API key used in production has spending limits set in Google Cloud console
- The Brave Search API key has a request cap appropriate for beta traffic
- No dev/test keys are present in production environment variables
- `ADMIN_PASSWORD` is a strong random string (not something set during early development)

---

### - [ ] Smoke test the full user journey end-to-end

**Severity: High**

Before any real user hits the app, manually walk the complete flow:

1. Land on homepage → click Start
2. Enter a description on `/start`
3. Upload a HEIC image on `/diagnosis` (verify heic2any lazy load works)
4. Watch `/processing` animate through steps
5. Read the report on `/report/[id]`
6. See contractor matches on `/match`
7. View a contractor profile on `/contractors/[id]`
8. Attempt to exceed the daily quota (verify the atomic fix works)
9. Log out and verify session is cleared

This must be done on a real mobile device (iOS Safari, Android Chrome) as well as desktop. The app is marketed to homeowners who will predominantly use it on phones.

---

## Phase 2 — Public Launch

These items should be addressed before opening registration to the general public — after a closed beta period has validated the core flow.

---

### - [x] Replace in-memory rate limiting with a distributed store

**Severity: High** (escalated from Phase 1 if deferred)

As noted above, the current rate limiter is non-functional at scale on serverless. This must be resolved before public launch even if it was consciously deferred for beta. See the process-local rate limiting item above for the implementation approach.

---

### - [x] Add structured AI cost tracking and budget alerts

**Severity: High**  
**File:** `src/lib/ai-logging.ts` (extend), new Supabase table `ai_cost_events`

The app makes Gemini API calls for: diagnosis generation (up to 5 images per request), parts price extraction (per part), and market rate refinement. There is currently no per-user, per-request cost tracking visible in the admin panel. Under a free-tier public beta with open registration, a single user who submits 50 diagnoses per day with 5 images each can generate significant API costs.

**Fix required:**

- Log estimated token counts and cost to a `ai_cost_events` table on every Gemini call
- Add a daily total to the admin analytics dashboard
- Set up a Cloud Monitoring alert (or simple cron check) that fires when daily Gemini spend exceeds a threshold
- Consider tightening the per-user daily diagnosis quota before public launch

---

### - [x] Implement a proper Content Security Policy

**Severity: Medium**  
**File:** `next.config.ts` (headers) or a new `middleware.ts` entry

The app embeds Google Maps, loads fonts, and makes API calls to Supabase and external services. Without a CSP, any XSS vulnerability allows arbitrary script injection. Set `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` headers on all responses.

---

### - [x] Add a global React error boundary with user-facing fallback

**Severity: Medium**  
**File:** `src/app/layout.tsx`

When a client component throws unexpectedly, Next.js will render its nearest `error.tsx` boundary. Currently there is no `error.tsx` at the root layout level — meaning unhandled errors produce a blank screen rather than a friendly "something went wrong" message with a retry action. Add `src/app/error.tsx` as the catch-all.

---

### - [ ] Implement a database backup and restore runbook

**Severity: Medium**

Before public launch, confirm Supabase's point-in-time recovery is enabled on the production project. Write a one-page runbook that documents how to restore from backup. This is a 30-minute task that removes a category of existential risk.

---

### - [x] Add structured logging for the diagnosis pipeline

**Severity: Medium**  
**Files:** `src/app/api/diagnose/route.ts`, `src/features/diagnosis/processing-orchestrator.ts`

For debugging production issues, structured logs (JSON with `conversationId`, `userId`, `stepName`, `durationMs`, `modelName`, `tokenCount`) are significantly more useful than `console.log`. Before public launch, ensure every major step in the diagnosis pipeline emits a structured log event that can be queried in Vercel's log drain or a logging service.

---

### - [ ] Accessibility audit of the core flow

**Severity: Medium**

The homeowner-facing flow (`/start` → `/diagnosis` → `/processing` → `/report` → `/match`) should pass a basic WCAG 2.1 AA audit. Run Axe DevTools or Lighthouse on each page and address:

- All images have `alt` text
- All interactive elements are keyboard-navigable
- Colour contrast ratios meet AA minimums (particularly text on the dark diagnosis card backgrounds)
- The file upload on `/diagnosis` works with a keyboard (no mouse required)

---

### - [ ] SEO: verify sitemap and canonical URLs

**Severity: Low**  
**Files:** `src/app/sitemap.ts`, `src/app/robots.ts`

Before public launch, confirm the sitemap includes all public-facing routes and excludes all admin, API, and auth routes. Verify canonical tags are correct. Test with Google Search Console's URL inspection tool.

---

### - [ ] Load test the diagnosis endpoint

**Severity: Medium**  
**File:** `src/app/api/diagnose/route.ts`

The diagnosis route chains a database write, up to 5 image uploads, a Gemini multimodal call, a second Gemini call, and a second database write — all within a single serverless function with `maxDuration: 60`. Run a load test at 10 concurrent requests to verify the p95 latency stays within the time limit and the rate limiter (once distributed) correctly throttles excess traffic.

---

*Last updated: May 2026. Owner: Matthew Prowse.*
