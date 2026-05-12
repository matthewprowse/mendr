# Wave 4c — Provider Search And Review Cleanup

## Progress
**Status:** ✅ Complete  
**Tasks:** 5 / 5 complete

---

## Goal
Remove the unused parallel provider-search implementation and consolidate constants.

## Scope
- `app/src/app/api/providers/providers-route.ts` (delete)
- `app/src/app/api/providers/providers-route-constants.ts` (delete/merge)
- `app/src/app/api/providers/constants.ts` (consolidate into)
- `app/src/app/contractors/hooks/reviews.ts` (delete if unused)

**Do NOT edit:** active `handler.ts`, admin auth, contractor UI beyond stale hooks.

## Tasks
- [x] Confirmed `providers-route.ts` had one external importer (`onboarding/search/route.ts`) — but only for `RETAIL_TYPES` from `providers-route-constants`, not from `providers-route.ts` itself. Deleted `providers-route.ts`.
- [x] `providers-route-constants.ts` and `constants.ts` were identical — repointed `onboarding/search/route.ts` to use `constants.ts`, then deleted `providers-route-constants.ts`
- [x] No further importers of `providers-route-constants` remain
- [x] `contractors/hooks/reviews.ts` had zero importers; `use-reviews.ts` is the active one (imported by `contractor-client.tsx`). Deleted `reviews.ts`.
- [x] No stale `/api/providers/{id}/reviews` callers found — canonical path is `POST /api/reviews`

## Verification Checklist
- [ ] `rg "providers-route" app/src` → zero
- [ ] `rg "providers-route-constants" app/src` → zero
- [ ] `rg "/api/providers/\${providerId}/reviews" app/src` → zero
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
