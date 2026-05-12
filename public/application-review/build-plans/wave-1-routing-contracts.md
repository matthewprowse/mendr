# Wave 1a — Routing And API Contract Fixes

## Progress
**Status:** ✅ Complete (verified via code inspection — all fixes applied by Cursor)  
**Tasks:** 5 / 5 complete

---

## Goal
Fix confirmed broken user-facing routes and API method/contract mismatches.

## Scope
- `app/src/app/chat/page.tsx`
- `app/src/app/api/cron/process-provider-applications/route.ts`
- `app/src/app/api/providers/apply/route.ts` (if needed for cron fix)
- `app/src/app/contractors/[id]/components/review-form.tsx`
- `app/src/app/pro/[id]/components/review-form.tsx`
- `app/src/app/pro/[id]/components/sticky-footer.tsx`
- `app/src/app/page/components/coverage-map.tsx`
- `app/src/app/page/_components/coverage-map.tsx`
- `app/src/app/api/providers/coverage/route.ts` (new, if implementing)

## Tasks
- [x] Fix `/chat?id=...` redirect → `/diagnosis/[id]`
- [x] Fix `/scan/new` in `sticky-footer.tsx` → `/start`
- [x] Fix cron method mismatch — add `POST` handler to `process-provider-applications` delegating to `GET` logic
- [x] Resolve stale review forms — delete or repoint to `/api/reviews` with camelCase payload
- [x] Resolve coverage map — remove both broken coverage-map components (implementing the missing route is out of scope)

## Safety Constraints
- Preserve existing scheduled cron `GET` behavior
- Keep `Authorization: Bearer ${CRON_SECRET}` check intact
- Prove files unused before deleting

## Verification Checklist
- [x] `/chat?id=test-id` redirects to `/diagnosis/test-id` — confirmed in `chat/page.tsx`
- [x] `/scan/new` string no longer appears in `app/src` — grep confirms zero hits
- [x] `POST /api/cron/process-provider-applications` no longer 405s — POST handler delegates to GET
- [x] No code references `/api/providers/coverage` — grep confirms zero hits
- [ ] `npm run lint` passes — run locally (sandbox filesystem incompatible with ESLint)
- [ ] `npm run build` passes — run locally (sandbox filesystem incompatible with Next.js build)
