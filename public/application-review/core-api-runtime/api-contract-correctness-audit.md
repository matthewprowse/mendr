# API Contract And Correctness Audit

## Executive Summary

The most concrete API correctness bug is a route-method mismatch: `app/src/app/api/providers/apply/route.ts` triggers `/api/cron/process-provider-applications` with `POST`, but `app/src/app/api/cron/process-provider-applications/route.ts` only exports `GET`. Scheduled cron still runs, but immediate processing after application submit does not.

Other high-confidence issues include a missing `/api/providers/coverage` route referenced by coverage map UI, a fully duplicated `welcome-upload-image` route, and a duplicated `api/pro/application/edit` implementation now hidden behind a redirect to `api/contractors/application/edit`.

## Files And Routes Reviewed

| Area | Paths |
| --- | --- |
| Cron | `api/cron/process-provider-applications`, `retry-enrichment`, `data-layer-maintenance` |
| Provider apply trigger | `api/providers/apply/route.ts` |
| Uploads | `api/upload-image/route.ts`, `api/welcome-upload-image/route.ts` |
| Application edit | `api/contractors/application/edit/route.ts`, `api/pro/application/edit/route.ts` |
| General public APIs | `contact`, `waitlist`, `events`, `reviews`, `reviews-count`, `geocode`, `directions`, `service-catalog`, `validate-start-description` |
| UI caller | `app/src/app/page/components/coverage-map.tsx` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| API-CT-01 | Critical | High | `providers/apply/route.ts` uses `fetch(..., { method: 'POST' })`; `cron/process-provider-applications/route.ts` only exports `GET`. | Immediate application processing fails; cron fallback waits up to 5 minutes. | Add `POST` handler delegating to the same logic or call `GET`. |
| API-CT-02 | High | High | `coverage-map.tsx` posts to `/api/providers/coverage`; no `api/providers/coverage/route.ts` exists. | Coverage map markers fail to load. | Implement route or change client to an existing provider endpoint. |
| API-CT-03 | Medium | High | `api/upload-image/route.ts` and `api/welcome-upload-image/route.ts` are effectively duplicate implementations. | Security/validation fixes can drift. | Delete unused welcome route or share one handler. |
| API-CT-04 | Medium | High | `api/pro/application/edit/route.ts` duplicates `api/contractors/application/edit/route.ts`; `next.config.ts` redirects API pro path. | Redundant maintenance surface. | Delete legacy route or re-export canonical handler. |
| API-CT-05 | Low | Medium | `contact` and `waitlist` use the `reviews` rate-limit bucket. | Misleading and coupled throttling. | Add dedicated buckets. |
| API-CT-06 | Low | High | `service-catalog/route.ts` returns status 500 with body `{ labels: [] }`. | Clients that only inspect labels may hide errors. | Return `{ error }` on 503, or 200 with explicit `degraded: true`. |
| API-CT-07 | Low | High | `validate-start-description/route.ts` returns `200 { ok: false, message }` for validation failure but `400 { error }` for parse failure. | Response handling is inconsistent. | Document or standardize validation envelope. |
| API-CT-08 | Info | High | ~~`enrich/get/route.ts` comment mentions GET bodies while handler is POST.~~ **Correction:** the file comment already correctly reads `POST /api/enrich/get` with body documentation. This finding is invalid and can be closed. | No issue. | No action required. |

## Method And Route Contract Mismatches

### Provider Application Processing

```text
POST /api/providers/apply
  -> fire-and-forget POST /api/cron/process-provider-applications

/api/cron/process-provider-applications
  -> only GET(req)
```

Fixing this should be prioritized because the app already contains the intended immediate trigger behavior.

**Verified:** the apply route calls `fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ${cronSecret}' } })`. The auth header is correct and already uses `CRON_SECRET`. The only required fix is adding `export async function POST(req)` to the cron route that delegates to the same logic as `GET`. No auth changes are needed on the trigger side.

### Coverage Map

```text
coverage-map.tsx
  -> POST /api/providers/coverage

api/providers/coverage/route.ts
  -> missing
```

Either implement the route or remove/replace the coverage map UI. This overlaps with consumer UI dead-code cleanup because coverage maps may themselves be unused.

**Verified:** the call to `/api/providers/coverage` appears in **two** locations — `app/src/app/page/components/coverage-map.tsx` (line 42) and `app/src/app/page/_components/coverage-map.tsx` (line 41). The `_components` version is likely the deprecated re-export or vice versa. Both call the missing route. Whichever is the active component, the route must be implemented or both callers must be removed together.

## Response And Validation Drift

- Most routes return `{ error }` on errors, but some use `{ ok: false, message }`.
- Some analytics routes intentionally return `{ ok: true }` even when dropping unknown events.
- `Response.json` and `NextResponse.json` are mixed; not a functional bug, but consistent route style would reduce friction.
- UUID validation differs between review submission and review count routes.

## Duplication Map

```text
upload-image/route.ts
  ~= welcome-upload-image/route.ts

contractors/application/edit/route.ts
  ~= pro/application/edit/route.ts
  next.config redirects /api/pro/application/edit -> /api/contractors/application/edit

providers/apply
  POST -> cron/process-provider-applications
  cron route only GET

coverage-map.tsx
  POST -> /api/providers/coverage
  route missing
```

## Suggested PR-Sized Fixes

1. **Cron trigger fix**: add `POST` to `process-provider-applications` or change apply trigger to `GET`.
2. **Coverage contract fix**: implement `/api/providers/coverage` or remove/repoint coverage map.
3. **Upload dedupe**: delete `welcome-upload-image/route.ts` or import shared handler.
4. **Application edit dedupe**: remove or re-export `api/pro/application/edit`.
5. **Rate limit naming**: add `contact` and `waitlist` bucket names.
6. **Small consistency polish**: normalize `service-catalog`, `validate-start-description`, and stale comments.
