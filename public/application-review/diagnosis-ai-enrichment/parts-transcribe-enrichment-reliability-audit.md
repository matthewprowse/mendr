# Parts, Transcribe, And Enrichment Reliability Audit

## Executive Summary

Provider enrichment is the most mature reliability stack in this area: it has explicit timeout helpers, scrape/image caps, retry/cooling rules, and cache upserts. The weaker areas are serverless duration alignment for enrichment cron/prewarm jobs, non-cancellable work after `Promise.race` timeouts, and misleading success counters.

`/api/transcribe` is reasonably small and guarded by size/rate constraints, but it has no explicit Google Speech deadline or retry policy. `/api/parts-prices` is the largest reliability/cost gap: it can run up to eight Brave + Gemini lookups under `maxDuration = 30`, without per-hop timeouts and without a route rate limit.

## Files And Routes Reviewed

| Area | Paths |
| --- | --- |
| Transcribe | `app/src/app/api/transcribe/route.ts` |
| Enrich API | `app/src/app/api/enrich/queue/route.ts`, `get/route.ts`, `prewarm/route.ts` |
| Parts API | `app/src/app/api/parts-prices/route.ts` |
| Provider enrichment | `app/src/lib/provider-enrichment.ts` |
| Parts libraries | `app/src/lib/parts-prices/lookup.ts`, `search.ts`, `extract-price.ts`, `types.ts`, `enrich-diagnosis.ts` |
| Brave search | `app/src/lib/market-rates/brave-web-search.ts` |
| Cron | `app/vercel.json`, `app/src/app/api/cron/retry-enrichment/route.ts` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| AI-ER-01 | High | High | `/api/enrich/prewarm` can process many providers sequentially with `maxDuration = 300`. | One invocation may not complete realistic batches; partial outcomes. | Use cursor-based smaller batches or queue/worker model. |
| AI-ER-02 | High | High | `/api/cron/retry-enrichment` processes sequential jobs but has no explicit `maxDuration`. | Serverless invocation can abort mid-batch. | Add `maxDuration`, reduce job count, or process one/few rows per invocation. |
| AI-ER-03 | High | Confirmed | `/api/parts-prices` resolves up to 8 parts concurrently via `Promise.allSettled` with no concurrency cap. Each part calls Brave search then Gemini. At 8 simultaneous Brave+Gemini chains under `maxDuration = 30`, the route can be hard-killed mid-batch. `p-limit` (or any concurrency-limiting library) is not in `package.json`. | Hard kills under load; tail latency grows with part count; external API bursts. | Add `p-limit` as a dependency (or implement manual batching) and cap concurrent lookups at 2–3. |
| AI-ER-04 | Medium | High | `extract-price.ts` calls Gemini without explicit timeout. | Hung model call burns route budget. | Wrap in timeout helper. |
| AI-ER-05 | Medium | High | `brave-web-search.ts` uses `fetch` without `AbortSignal`. | Hung external fetch starves request. | Add `AbortSignal.timeout` and one retry/backoff. |
| AI-ER-06 | Medium | High | `/api/enrich/queue` uses `Promise.race` timeouts but does not cancel underlying work. | Costs may continue after timeout. | Plumb `AbortController` into fetches and lower concurrency where cancellation is impossible. |
| AI-ER-07 | Medium | High | `/api/enrich/queue` response `processed` counts attempts rather than successes. | Operators/clients infer false success. | Return `queued`, `succeeded`, `failed`, `timeouts`, and per-id results. |
| AI-ER-08 | Medium | Medium | `transcribe/route.ts` has no explicit Google Speech deadline/retry. | Transient GCP errors and stalls surface as generic failures. | Configure deadline and retry for transient `UNAVAILABLE`/deadline cases. |
| AI-ER-09 | Medium | High | `/api/enrich/get` uses process-local memory maps for cache/inflight. | Cache miss storms across serverless instances. | Use Redis/Upstash for short TTL if this path is hot. |
| AI-ER-10 | Medium | High | `/api/parts-prices` has no rate limit. | Public Brave/Gemini cost exposure. | Add `partsPrices` rate limit bucket. |
| AI-ER-11 | Low | High | `lookup.ts` comment says 28-day cache while `types.ts` defines 14-day TTL. | Debug/ops confusion. | Align comment with constant. |
| AI-ER-12 | Low | High | `app/src/app/api/diagnose/image-tier.ts` is not imported. | Dead code candidate. | Delete or wire into diagnosis flow. |

## Timeout, Retry, And Idempotency Map

| Flow | Timeout | Retry | Idempotency/cache |
| --- | --- | --- | --- |
| Transcribe | SDK default only | None in app | Inserts telemetry row every request |
| Provider enrichment | Internal `withTimeout` helper | Some guarded retry/cooling logic | Upserts provider cache by provider ID |
| Enrich queue | Per-job `Promise.race` | No true cancellation | No HTTP idempotency key |
| Enrich get | Memory cache/inflight | N/A | Process-local only |
| Parts prices | Route `maxDuration = 30` | None | Supabase cache by `cache_key` after completion |
| Brave search | None explicit | None | Depends on parts cache after lookup |

## Cache And Batching Opportunities

- Add singleflight/cache-stampede protection for identical parts-price lookups.
- Limit parts lookup concurrency to 2-3.
- Move `enrich/get` hot cache to Redis if used frequently across serverless instances.
- Make enrichment prewarm/retry jobs cursor-based instead of large sequential batches.
- Return honest job success/failure counts from enrichment queue.

## Unused Or Obsolete Candidates

| Candidate | Evidence | Action |
| --- | --- | --- |
| `app/src/app/api/diagnose/image-tier.ts` | `runImageTiering` not imported elsewhere | Delete or integrate |
| Parts cache comment | TTL comment conflicts with constant | Fix documentation |
| Server-relative `fetch('/api/parts-prices')` in enrichment helper | Safe only in browser contexts | Add server-callable path or document browser-only usage |

## Suggested PR-Sized Fixes

1. **Parts hardening**: add rate limit, Brave timeout, Gemini timeout, and concurrency cap.
2. **Enrich queue response**: report succeeded/failed/timeouts accurately.
3. **Cron survivability**: set `maxDuration` on retry cron and reduce batch size.
4. **Transcribe resilience**: configure Google Speech deadline and transient retry.
5. **Cache consistency**: add Redis/singleflight for hot enrich/parts paths.
6. **Hygiene**: remove or wire `image-tier.ts`; fix TTL comments.

## Suggested Tests

- Mock parts cache hit and assert no Brave/Gemini call.
- Mock parts cache miss and assert concurrency cap.
- Mock Brave timeout and assert graceful partial result.
- Mock enrichment job timeout and assert response includes timeout count.
- Mock transcribe transient error and assert retry/sanitized error path.
