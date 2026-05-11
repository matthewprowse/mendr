# Wave 2 Build Plan: Admin Auth And Session Consolidation

## Goal

Replace duplicated admin cookie checks with one helper and improve the admin session model without mixing in unrelated admin UI refactors.

## Source Reports

- `../core-api-runtime/auth-session-middleware-audit.md`
- `../contractor-provider-admin/admin-onboarding-auth-duplication-audit.md`

## Scope

Files this agent may edit:

- `app/src/lib/admin-auth.ts` (new)
- `app/src/app/api/admin/login/route.ts`
- `app/src/proxy.ts`
- `app/src/app/api/admin/**/route.ts`
- `app/src/app/admin/components/sign-out-button.tsx` only if logout contract changes

Files this agent must not edit:

- Admin page UI such as `admin/providers/client.tsx`
- Provider application routes
- Rate-limit core
- Diagnosis/AI code

## Tasks

- [ ] Create `app/src/lib/admin-auth.ts`.
- [ ] Move admin cookie verification into the helper.
- [ ] Replace duplicated `checkAdminCookie` functions across admin API routes.
- [ ] Replace base64 password-equivalent cookie with a signed opaque token or HMAC-signed session value with expiration.
- [ ] Keep backwards compatibility only if needed for one deploy cycle; otherwise replace outright.
- [ ] Ensure `proxy.ts` uses the shared helper if it remains the active Next 16 proxy.

## Safety Constraints

- Do not expose `ADMIN_PASSWORD` or derived password-equivalent values to the client.
- Keep cookies `httpOnly`, `sameSite`, and appropriate `secure` behavior.
- Avoid broad admin UI edits in this wave.
- If a server-side session store is required, choose the smallest existing dependency-compatible approach and document it.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- Admin login succeeds with correct password.
- Admin API routes accept valid session and reject invalid/missing session.
- Admin logout clears the session.
- Old base64 cookie is no longer accepted unless explicitly kept as a short transition.
- `rg "checkAdminCookie" app/src/app/api/admin` should be zero or only in tests/docs.

## Suggested Agent Prompt

Implement only admin auth consolidation and session hardening from this build plan. Do not split admin UI or touch provider/diagnosis code. Keep the diff mechanical where possible and include validation results.
