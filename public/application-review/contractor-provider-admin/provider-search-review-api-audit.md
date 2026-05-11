# Provider Search And Review API Audit

## Executive Summary

The active provider search route is `POST /api/providers`, exported from `app/src/app/api/providers/route.ts` and implemented in `handler.ts`. A large parallel implementation, `providers-route.ts`, appears unused and diverges from the active handler. It should be removed after a final parity check.

Review submission has a serious contract footgun: orphan review form components post to `/api/providers/${providerId}/reviews`, but no matching route exists, and their payload shape does not match the actual `POST /api/reviews` route. The live contractor reviews hook uses `/api/reviews`, but the stale forms remain dangerous.

The homepage coverage map posts to `/api/providers/coverage`, but no such route exists.

## Files And Routes Reviewed

| Area | Paths |
| --- | --- |
| Provider search active | `app/src/app/api/providers/route.ts`, `handler.ts` |
| Provider search duplicate | `app/src/app/api/providers/providers-route.ts` |
| Provider constants | `constants.ts`, `providers-route-constants.ts` |
| Provider profile | `app/src/app/api/providers/[id]/route.ts` |
| Reviews API | `app/src/app/api/reviews/route.ts` |
| Review forms/hooks | `app/src/app/contractors/hooks/use-reviews.ts`, `contractors/[id]/components/review-form.tsx`, `pro/[id]/components/review-form.tsx` |
| Coverage map | `app/src/app/page/components/coverage-map.tsx`, `_components/coverage-map.tsx` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| CPA-PR-01 | Critical | High | `contractors/[id]/components/review-form.tsx` posts to `/api/providers/${providerId}/reviews`; no such route exists. | If rendered, review submission 404s. | Delete stale form or map to `/api/reviews`; optionally add typed proxy route. |
| CPA-PR-02 | High | High | Stale form sends `body`, `reviewer_name`, `category_ratings`; `api/reviews` expects `reviewBody`, `reviewerName`, `categoryRatings` with `work_quality`. | Even with URL fixed, request validation fails. | Align payload contract or use existing hook implementation. |
| CPA-PR-03 | High | High | `coverage-map.tsx` posts to `/api/providers/coverage`; route missing. | Coverage map feature is broken. | Implement route or remove/repoint map. |
| CPA-PR-04 | Medium | High | `providers-route.ts` has no production importers; `route.ts` uses `handler.ts`. | 1k+ line duplicate can drift. | Delete after parity check. |
| CPA-PR-05 | Medium | High | Active `handler.ts` supports `quick` mode; duplicate does not. | If duplicate is wired, match quick path regresses. | Keep only `handler.ts`. |
| CPA-PR-06 | Medium | High | Active handler has transient Places handling; duplicate throws differently. | Different error semantics if swapped. | Delete duplicate and test active behavior. |
| CPA-PR-07 | Medium | High | Provider search handler performs multiple Google Places calls and background review sync. | Hot path is hard to profile and maintain. | Extract search, mapping, ranking, and persistence phases. |
| CPA-PR-08 | Low | High | `constants.ts` and `providers-route-constants.ts` duplicate constants. | Drift risk. | Consolidate to one constants file. |
| CPA-PR-09 | Low | Medium | `contractors/hooks/reviews.ts` and `use-reviews.ts` appear parallel. | Duplicate hook maintenance. | Delete unused duplicate after import verification. |

## Review Route Contract Analysis

### Canonical Contract

`app/src/app/api/reviews/route.ts` expects:

```text
providerId
reviewerName
reviewTitle?
reviewBody
categoryRatings:
  punctuality
  cleanliness
  work_quality
  quote_accuracy
```

The live contractor hook `app/src/app/contractors/hooks/use-reviews.ts` posts this shape to `/api/reviews`.

### Stale Contract

`contractors/[id]/components/review-form.tsx` and `pro/[id]/components/review-form.tsx` post:

```text
/api/providers/${providerId}/reviews
body
reviewer_name
category_ratings
image_urls
```

This is both a missing route and a mismatched body.

## Provider Search Duplication And Performance

Active `handler.ts` appears to own:

- Request parsing and `quick` mode.
- Search cache reads/writes.
- Google Places text search and pagination.
- Provider row mapping and relevance.
- Provider cache/cert/image prefetch.
- Ranking and rotation tokens.
- Background provider upsert and review sync.

The unused `providers-route.ts` appears older and diverges on:

- `quick` support.
- Pagination cap.
- transient Places HTTP handling.
- cached provider name normalization.
- request parsing behavior.

Recommended extraction targets from `handler.ts`:

```text
provider-search-cache.ts
places-text-search.ts
map-places-to-providers.ts
provider-prefetch.ts
provider-ranking-response.ts
provider-background-persist.ts
```

## Dead Or Obsolete Candidates

- `app/src/app/api/providers/providers-route.ts`
- `app/src/app/api/providers/providers-route-constants.ts`
- `app/src/app/contractors/[id]/components/review-form.tsx` if unused
- `app/src/app/pro/[id]/components/review-form.tsx`
- `app/src/app/contractors/hooks/reviews.ts` if unused
- `/api/providers/coverage` call site if coverage map is unused

## Suggested PR-Sized Fixes

1. **Review form hygiene**: remove or fix stale review forms; ensure one typed contract to `/api/reviews`.
2. **Coverage map contract**: implement `/api/providers/coverage` or remove/repoint coverage map.
3. **Delete provider duplicate**: remove `providers-route.ts` and consolidate constants.
4. **Split provider handler**: extract the background persistence and Google review sync first.
5. **Bound background Google review fetches**: use bounded concurrency or queue.
6. **Delete unused hook duplicates** after import verification.
