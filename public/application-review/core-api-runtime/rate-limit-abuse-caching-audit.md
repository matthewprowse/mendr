# Rate Limit, Abuse Surface, And Caching Audit

## Executive Summary

The app uses named IP buckets through `checkRateLimit` in `app/src/lib/rate-limit-config.ts`, backed by an in-process `Map` in `app/src/lib/rate-limit.ts`. This works locally but is not reliable abuse protection in a serverless deployment because counters are per instance and reset on cold starts.

Several public write or expensive routes are rate-limited, but important gaps remain. `POST /api/events` writes analytics rows using the service-role client without a rate limit. Additional high-cost public routes such as `providers/apply`, `parts-prices`, `convert-heic`, and some provider upload routes have weak or missing limits.

Caching is uneven. Geocode and directions use Supabase cache tables; service catalog uses Redis plus memory cache; marketing stats performs a relatively heavy cold-path query and relies on CDN cache headers.

## Files And Routes Reviewed

| Area | Paths |
| --- | --- |
| Rate limit core | `app/src/lib/rate-limit.ts`, `app/src/lib/rate-limit-config.ts` |
| Analytics events | `app/src/app/api/events/route.ts` |
| Contact/waitlist | `app/src/app/api/contact/route.ts`, `app/src/app/api/waitlist/route.ts` |
| Geocode/directions | `app/src/app/api/geocode/route.ts`, `app/src/app/api/directions/route.ts` |
| Reviews | `app/src/app/api/reviews/route.ts`, `app/src/app/api/reviews-count/route.ts` |
| Marketing stats | `app/src/app/api/public/marketing-stats/route.ts` |
| Redis cache example | `app/src/lib/service-catalog-server.ts` |
| Related high-risk routes | `providers/apply`, `providers/clean-profile`, `parts-prices`, `convert-heic`, provider application uploads |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| API-RL-01 | Critical | High | `rate-limit.ts` stores counters in `globalThis` Map. | Rate limits are per serverless instance, not global. | Move production counters to Redis/Upstash or provider edge rate limiting. |
| API-RL-02 | High | High | `events/route.ts` accepts public POST and inserts into `diagnosis_events` without `checkRateLimit`. | DB spam, analytics pollution, write cost. | Add `analyticsEvents` bucket and validate/sanitize event contract. |
| API-RL-03 | High | High | `providers/apply/route.ts` has no `checkRateLimit` import. | Application spam, email noise, DB load. | Add `providerApply` bucket and optionally CAPTCHA/device checks. |
| API-RL-04 | High | High | `parts-prices/route.ts` calls external Brave/Gemini-backed lookup and has no rate limit. | Public external API cost surface. | Add `partsPrices` bucket and session/auth binding if possible. |
| API-RL-05 | Medium | High | `convert-heic/route.ts` performs CPU conversion without route-specific rate limit. | CPU/memory abuse. | Add `heicConvert` bucket and enforce file-size limits. |
| API-RL-06 | Medium | High | `contact/route.ts` and `waitlist/route.ts` reuse the `reviews` bucket. | Contact/waitlist/review traffic throttles each other. | Add separate `contactForm` and `contractorWaitlist` buckets. |
| API-RL-07 | Medium | Confirmed | `public/marketing-stats/route.ts` fetches up to 20,000 `session_id` rows (`.select('session_id').limit(20000)`) and deduplicates in JavaScript using `new Set(...)`. Other stats use `{ count: 'exact', head: true }` correctly. The unique-homeowners count is the outlier. | Cold origin requests scan up to 20,000 rows and do JS dedup in the serverless function — a hard DB read on every uncached request. | Replace the `session_id` scan with a DB-side `COUNT(DISTINCT session_id)` query or a daily rollup table. Both approaches eliminate the row fetch entirely. |
| API-RL-08 | Medium | High | Env bypasses include `DISABLE_RATE_LIMIT` and `RATE_LIMIT_BYPASS_IPS`. | Production misconfiguration can disable safeguards. | Add deployment/CI guardrails and explicit production warnings. |
| API-RL-09 | Low | High | `rate-limit-config.ts` comments say geocode has no cache, but `geocode/route.ts` uses `geocode_cache`. | Operational confusion. | Fix comment/runbook. |

## Public Abuse Surface Map

| Route | Method | Auth | Rate limit | Side effects |
| --- | --- | --- | --- | --- |
| `/api/events` | POST | None | None | Insert `diagnosis_events` |
| `/api/contact` | POST | None | `reviews` | Insert contact + SendGrid |
| `/api/waitlist` | POST | None | `reviews` | Insert application-ish row |
| `/api/geocode` | POST | None | `geocode` | Google call + cache upsert |
| `/api/directions` | GET | None | `directions` | Google call + cache upsert |
| `/api/reviews` | POST | None | `reviews` | Insert pending review |
| `/api/reviews-count` | POST | None | `reviewsCount` | Read counts |
| `/api/public/marketing-stats` | GET | None | None | Heavy read |
| `/api/parts-prices` | POST | None | None | Brave/Gemini on cache miss |
| `/api/convert-heic` | POST | None | None | CPU conversion |

## Rate Limit Bucket Map

Current defined buckets include `diagnose`, `providers`, `geocode`, `directions`, `enrichQueue`, `uploadImage`, `transcribe`, `reviews`, `reviewsCount`, `applicationEdit`, and others.

Missing or misused buckets:

- `analyticsEvents`
- `providerApply`
- `partsPrices`
- `heicConvert`
- `contactForm`
- `contractorWaitlist`

## Cache And Expensive Query Findings

### Geocode

Uses `geocode_cache` with a long TTL, then Google Geocode on miss. Documentation should reflect that cache exists.

### Directions

Uses `directions_cache` with rounded origin/destination keys. This is a sound pattern; ensure route limits match Google quota.

### Marketing Stats

Fetches recent `welcome_start` session IDs and counts unique sessions in memory. Replace with database-side aggregation or a rollup table.

### Service Catalog

`service-catalog-server.ts` uses Upstash Redis and a memory cache. This is a good pattern to reuse for global rate limits or public stats JSON.

## Suggested PR-Sized Fixes

1. Add rate limiting to `/api/events`.
2. Implement Redis-backed production rate limiting while keeping memory fallback for local dev.
3. Split `reviews` bucket into `reviews`, `contactForm`, and `contractorWaitlist`.
4. Add rate limits to `providers/apply`, provider application uploads, `parts-prices`, and `convert-heic`.
5. Replace marketing-stats row scan with DB aggregate or rollup.
6. Gate or rate-limit `providers/clean-profile` because it mutates provider rows.
7. Fix geocode rate-limit comments to match actual cache behavior.
