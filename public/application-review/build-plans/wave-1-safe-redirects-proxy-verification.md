# Wave 1b — Safe Redirects And Admin Proxy Verification

## Progress
**Status:** ✅ Complete (verified via code inspection — all fixes applied by Cursor)  
**Tasks:** 4 / 4 complete

---

## Goal
Harden redirect handling in the auth callback and admin login. Verify whether `proxy.ts` is active under this Next.js version before changing middleware architecture.

## Scope
- `app/src/lib/safe-redirect.ts` (new)
- `app/src/app/auth/callback/route.ts`
- `app/src/app/admin/login/client.tsx`
- `app/src/app/api/admin/login/route.ts`

**Do NOT edit:** `proxy.ts`, `next.config.ts`, provider/diagnosis code, admin API route auth helpers.

## Tasks
- [x] Verify `proxy.ts` / Next.js middleware behavior — `src/proxy.ts` is the active admin guard; intercepts `/admin/**`, validates `admin_session` cookie against base64 of `ADMIN_PASSWORD`; no `middleware.ts` exists
- [x] Create `app/src/lib/safe-redirect.ts` with `safeRedirectPath(input, fallback)` — full implementation including `allowedPathPrefixes` option
- [x] Apply helper in `auth/callback/route.ts`
- [x] Apply helper in `admin/login/client.tsx` — restricts to `/admin/**` via `ADMIN_REDIRECT_OPTIONS`

## Safety Constraints
- Do NOT add `middleware.ts` unless verification proves `proxy.ts` is not active
- Do NOT weaken cookie flags
- Do NOT change admin session token design (belongs to Wave 2)

## Verification Checklist
- [x] `?next=/admin/providers` → stays internal after login — `safeRedirectPath` with `/admin` prefix allows this
- [x] `?next=https://example.com` → falls back to `/admin` — scheme-bearing inputs rejected
- [x] `?next=//example.com` → falls back to `/admin` — protocol-relative inputs rejected
- [x] Auth callback rejects external/protocol-relative `next` values — same helper used
- [ ] `npm run lint` passes — run locally (sandbox filesystem incompatible with ESLint)
- [ ] `npm run build` passes — run locally
