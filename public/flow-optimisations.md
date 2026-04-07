# Flow Optimisations: /welcome -> /diagnosis -> /match

Last updated: 2026-04-06

## Scope

This document tracks performance optimisations for the user flow:

- `/welcome`
- `/diagnosis`
- `/match`

It also records known UX/performance constraints affecting conversion and perceived speed.

---

## Completed Optimisations

### 1) Provider API responsiveness (`/api/providers`)

- Added stage-level timing instrumentation in development.
- Reduced overfetch of Google Places pages for smaller radii using an adaptive target.
- Kept heavy persistence/review sync work off the critical response path (fire-and-forget).
- Added provider response debug timing payload in development for easier analysis.

Outcome:

- Significant reduction from earlier worst-case provider waits.
- Better visibility into which server stages consume time.

### 2) Match page fetch behaviour

- Added in-flight de-duplication for identical provider requests in `useMatchProviders`.
- Preserved stale-request cancellation, but prevented duplicate identical calls from rapid state updates.

Outcome:

- Less network chatter and fewer redundant provider requests.

### 3) Enrichment polling and diagnostics

- Replaced overlapping enrichment poll loops with one coordinated polling scheduler.
- Added stop-reason diagnostics (`enriched`, `aborted`, `max_rounds`, `error`) in development.

Outcome:

- Cleaner polling behavior and easier root-cause analysis.

### 4) Enrichment endpoint performance

`/api/enrich/get`:

- Added short-lived memory cache (TTL-based) for repeated poll requests.
- Added in-flight request de-duplication.
- Added stage timing logs in development.

`/api/enrich/queue`:

- Switched to non-blocking queue acceptance response (fire-and-forget processing).
- Added stage timing logs in development.

Outcome:

- Major improvement in enrichment endpoint responsiveness during repeated polling.

### 5) Automated perf runner

- Added `scripts/perf/match-flow.ts`.
- Added npm script: `npm run perf:match-flow`.
- Added dev-only conversation seeding endpoint: `/api/dev/perf-seed-match`.
- Added diagnostics to perf reports:
  - endpoint timings
  - final URL
  - console errors
  - failed API responses
  - screenshot + HTML artifact paths

Outcome:

- Repeatable, evidence-based profiling workflow without manual conversation setup.

---

## Measured Improvements (snapshot)

Representative measured changes during optimisation runs:

- `/api/providers`: improved from ~18s range down to ~10s range, and ~1.5s on warmed/repeated runs.
- `/api/enrich/get`: improved from multi-second averages to sub-second averages on repeated polling scenarios.
- `/api/enrich/queue`: improved from long blocking responses to much faster acceptance responses.

Notes:

- Exact timings vary by cache warmness, environment load, and external API latency.
- Use perf reports in `scripts/perf/reports` for run-specific evidence.

---

## Next High-Impact Optimisations

### A) Diagnosis latency (`/diagnosis`)

- Add stage instrumentation to `/api/diagnose`.
- Cache service catalog server-side to avoid repeated fetches.
- Persist in-progress diagnosis state and improve resume behavior.
- Confirm image compression remains client-side before upload so preprocessing does not inflate server-side diagnose latency.

### B) Prewarm provider results

- Prefetch provider results from diagnosis (when trade + location are known) so match opens with warm data.
- Ensure query-path indexes are in place for stable `/match` p95 as data volume grows:
  - `google_place_id`
  - `lat`
  - `lng`
  - `trade_category`
  - `active`

### C) Shared cache for distributed environments

- Move short-lived enrichment response cache from process memory to shared cache (e.g. Redis) for multi-instance consistency.

### D) Payload/critical-path trimming

- Return only first-paint-essential enrichment fields initially; lazy-load the rest.

### E) Preload hygiene

- Remove non-critical preloads that may compete with diagnosis/providers traffic.

---

## Known UX / Product Gap

The **PRO Provider page is currently not responsive** in the same way as:

- `/welcome`
- `/diagnosis`
- `/match`

This should be treated as a separate UI/responsiveness track, with parity targets for mobile-first behavior, layout consistency, and interaction affordances.

---

## Operational Notes

- Perf runner assumes local dev server on `http://localhost:3000`.
- Default seeded location for perf is Cape Town:
  - lat: `-33.9249`
  - lng: `18.4241`
  - address: `Cape Town, South Africa`

---

## Success Criteria (recommended)

- `/diagnosis` result time:
  - p50 < 4s
  - p95 < 8s
  - guardrail: maintain client-side image compression prior to diagnose request
- `/match` first providers:
  - p50 < 2s
  - p95 < 5s
- `/api/enrich/get` (cache hit path only):
  - p50 < 300ms
  - p95 < 800ms
- Enrichment pipeline (cache miss, background):
  - 95% completion within 10s
  - error rate < 5%

