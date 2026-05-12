# Wave 2 — Admin Auth And Session Consolidation

## Progress
**Status:** ✅ Complete  
**Tasks:** 5 / 5 complete

---

## Goal
Replace 11 copy-pasted `checkAdminCookie` functions with one shared helper, and replace the base64-password cookie with a proper session token.

## Scope
- `app/src/lib/admin-auth.ts` (new)
- `app/src/app/api/admin/login/route.ts`
- `app/src/proxy.ts`
- All `app/src/app/api/admin/**/route.ts`
- `app/src/app/admin/components/sign-out-button.tsx` (if logout contract changes)

**Do NOT edit:** admin page UI, provider/diagnosis routes, rate-limit core.

## Tasks
- [x] Create `app/src/lib/admin-auth.ts` with `verifyAdminCookie(req)`, `requireAdmin(req)`, `createAdminSession()`, `setAdminCookie()`, `clearAdminCookie()` — uses Web Crypto HMAC-SHA-256, constant-time comparison, Edge-compatible
- [x] Replace base64 password cookie with HMAC-signed opaque token (`<expiry_ms>.<hmac_hex>`) with 24h expiry
- [x] Replace all 11 copy-pasted `checkAdminCookie` functions in `api/admin/**` with `requireAdmin` via Python sweep
- [x] Update `proxy.ts` to use `verifyAdminCookie` from shared helper
- [x] `api/admin/login` POST issues HMAC token via `createAdminSession`/`setAdminCookie`; DELETE clears via `clearAdminCookie`

## Safety Constraints
- Cookie must remain `HttpOnly`, `SameSite=Lax`, `Secure` in production
- Old cookie format should be rejected immediately (no transition window needed — admin-only)
- No broad admin UI changes in this wave

## Verification Checklist
- [x] `rg "checkAdminCookie" app/src/app/api/admin` → zero results — confirmed clean
- [x] `Buffer.from(...).toString('base64')` removed from all admin auth paths — confirmed clean
- [ ] Admin login with correct password → valid session — smoke test locally
- [ ] Admin API routes reject invalid/missing session → 401 — smoke test locally
- [ ] Admin logout clears session — smoke test locally
- [ ] Old base64 cookie is rejected — automatic: HMAC verification will fail for any old `base64(password)` token
- [ ] `npm run lint` passes — run locally
- [ ] `npm run build` passes — run locally
