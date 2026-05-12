# Wave 3a — Rate Limits And Public Abuse Surfaces

## Progress
**Status:** ✅ Complete  
**Tasks:** 6 / 6 complete

---

## Goal
Add missing rate-limit buckets for unprotected public routes, split misused buckets, and wire them up.

## Scope
- `app/src/lib/rate-limit-config.ts`
- `app/src/app/api/events/route.ts`
- `app/src/app/api/providers/apply/route.ts`
- `app/src/app/api/parts-prices/route.ts`
- `app/src/app/api/convert-heic/route.ts`
- `app/src/app/api/contact/route.ts`
- `app/src/app/api/waitlist/route.ts`

**Do NOT edit:** admin auth, diagnosis AI route internals, provider search handler.

## Tasks
- [x] Add buckets: `analyticsEvents` (60/min), `providerApply` (3/hr), `partsPrices` (5/hr), `heicConvert` (20/hr), `contactForm` (5/hr), `contractorWaitlist` (5/hr) — in `rate-limit-config.ts`
- [x] Apply `analyticsEvents` bucket to `POST /api/events`
- [x] Apply `providerApply` bucket to `POST /api/providers/apply`
- [x] Apply `partsPrices` bucket to `POST /api/parts-prices` — also upgraded `req: Request` → `NextRequest`
- [x] Apply `heicConvert` bucket to `POST /api/convert-heic` — also upgraded `req: Request` → `NextRequest`
- [x] Split `contact` and `waitlist` away from the shared `reviews` bucket → `contactForm` and `contractorWaitlist`

## Safety Constraints
- Limits must be conservative enough not to block ordinary use
- Existing local-dev in-memory fallback must keep working
- Do not change route response shapes except adding 429

## Verification Checklist
- [ ] `rg "reviews.*contact\|reviews.*waitlist"` → zero (buckets split)
- [ ] Events route returns 429 after bucket exhausted in test
- [ ] Contact and waitlist use their own buckets
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
