# Auth, Session, And Middleware Audit

## Executive Summary

The app contains an intended admin route guard in `app/src/proxy.ts`, but no `middleware.ts` exists in the repository. That means the `proxy` function is not wired into Next.js middleware execution, so admin pages are likely not protected at the page-entry layer. Admin API routes do duplicate cookie checks, but the UI shell can still render unless protected elsewhere.

Two redirect surfaces need hardening: the Supabase auth callback accepts `next` values with only a `startsWith('/')` check, and the admin login client reads `next` from query params and calls `router.push(next)` after successful login. Both should use a shared safe-redirect helper.

Admin sessions are currently deterministic: `admin_session` is the base64 encoding of `ADMIN_PASSWORD`. That is not a signed session; if the cookie is stolen, it is effectively password-equivalent.

## Files And Routes Reviewed

| Path | Role |
| --- | --- |
| `app/src/proxy.ts` | Intended admin guard |
| `app/src/app/auth/callback/route.ts` | Supabase OAuth callback and redirect |
| `app/src/lib/supabase-server.ts` | Supabase anon/server and service-role helpers |
| `app/src/app/api/admin/login/route.ts` | Admin login cookie creation/deletion |
| `app/src/app/admin/login/client.tsx` | Admin login UI and `next` navigation |
| `app/src/app/admin/layout.tsx` | Admin layout; no server auth gate |
| `app/src/app/api/admin/**/route.ts` | Repeated admin cookie checks |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| API-AU-01 | High | Confirmed | `app/src/proxy.ts` exports `proxy` and `config`, but no `middleware.ts` exists. | `/admin` pages are not protected by the intended edge/page middleware. | Add a real `middleware.ts` or enforce auth in admin layouts/server components. |
| API-AU-02 | High | High | `app/src/app/admin/login/client.tsx` uses `next` from search params and calls `router.push(next)`. | Open redirect after successful admin login. | Normalize to same-origin admin-relative paths only. |
| API-AU-03 | Medium | High | `app/src/app/auth/callback/route.ts` builds redirect URL when `next.startsWith('/')`. | Weak redirect validation; protocol-relative and encoded edge cases need rejection. | Use `new URL(next, origin)` and require `url.origin === origin`; optionally allowlist paths. |
| API-AU-04 | Medium | Confirmed | `checkAdminCookie` logic is copy-pasted across many `app/src/app/api/admin` routes. | Drift risk and missed auth fixes. | Extract `lib/admin-auth.ts` with `verifyAdminCookie`/`requireAdmin`. |
| API-AU-05 | Medium | High | `api/admin/login/route.ts` stores `Buffer.from(ADMIN_PASSWORD).toString('base64')` as the session cookie. | Cookie theft recovers a password-equivalent session token. | Use signed opaque session tokens with TTL, rotation, and HttpOnly cookie. |
| API-AU-06 | Low | High | `createSupabaseAdminClient` caches a service-role client at module scope. | Mostly acceptable, but should be documented for tests and hot reload. | Keep but document; avoid mutable singleton state beyond the client. |
| API-AU-07 | Low | High | Supabase cookie `setAll` swallows errors in server components. | Debugging auth cookie failures is harder. | Log in development or add structured warning where appropriate. |

## Confirmed Security Bugs

### Admin Page Middleware Is Not Wired

`app/src/proxy.ts` performs a path check for `/admin`, reads `ADMIN_PASSWORD`, compares `admin_session`, and redirects to `/admin/login` when missing. Without a Next.js `middleware.ts`, this code is inert. The admin APIs may still reject data requests, but page shells and any server-rendered static content can be reached.

### Admin Login Open Redirect

`app/src/app/admin/login/client.tsx` trusts `next` from the URL and navigates with `router.push(next)`. This should be restricted to known admin paths, such as `/admin`, `/admin/providers`, `/admin/reviews`, etc.

## Suspected Risks And Verification Steps

| Risk | Verification |
| --- | --- |
| Auth callback accepts unsafe `next` variants | Test `next=//evil.example`, encoded slashes, and backslashes; assert same-origin redirect only. |
| Admin login external navigation | Login with `?next=https://example.com`; assert route stays in app. |
| Admin API route missed auth check | Grep all `app/src/app/api/admin/**/route.ts`; ensure every handler calls shared auth helper after extraction. |
| Public admin pages render | E2E unauthenticated request to `/admin`, `/admin/providers`, `/admin/gallery`. |

## Recommended Auth Architecture

1. Add a real `middleware.ts` for `/admin` routes, excluding `/admin/login`.
2. Move cookie verification to `app/src/lib/admin-auth.ts`.
3. Replace base64 password cookie with signed opaque session token.
4. Create `safeRedirectPath(input, fallback)` and use it in admin login and auth callback.
5. Keep `createSupabaseAdminClient` service-role usage restricted to routes that have passed admin, cron, or explicit server-side authorization.

## Suggested PR-Sized Fixes

1. **Wire admin middleware**: create `middleware.ts` that calls the existing admin guard or an extracted helper.
2. **Safe redirect helper**: apply to `auth/callback/route.ts` and admin login.
3. **Admin auth helper**: replace duplicated `checkAdminCookie` in all admin API routes.
4. **Signed admin session**: replace deterministic base64 cookie with signed opaque token and TTL.
5. **Tests**: add middleware redirect tests and safe redirect unit tests for `//`, `https://`, `%2f%2f`, and backslash cases.
