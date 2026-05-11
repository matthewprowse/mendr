# Wave 1 Build Plan: Safe Redirects And Admin Proxy Verification

## Goal

Harden redirect handling and verify whether `app/src/proxy.ts` is active under Next 16 before changing middleware architecture.

## Source Reports

- `../core-api-runtime/auth-session-middleware-audit.md`
- `../contractor-provider-admin/admin-onboarding-auth-duplication-audit.md`

## Scope

Files this agent may edit:

- `app/src/app/auth/callback/route.ts`
- `app/src/app/admin/login/client.tsx`
- `app/src/app/api/admin/login/route.ts`
- New helper: `app/src/lib/safe-redirect.ts`
- Proxy verification notes in a new local test/check file only if the repo has a clear test pattern

Files this agent must not edit:

- `app/src/proxy.ts` unless the verification proves it is not running
- Admin API route auth helpers
- `next.config.ts`
- Provider/diagnosis code

## Tasks

- [ ] Verify Next 16 `proxy.ts` behavior for this repo. `proxy.ts` is a valid Next 16 convention, so do not assume it is inert only because `middleware.ts` is absent.
- [ ] Add a shared `safeRedirectPath(input, fallback, options?)` helper.
- [ ] Use the helper in `auth/callback/route.ts`.
- [ ] Use the helper for admin login navigation so raw `?next=` is not passed directly to `router.push`.
- [ ] Keep redirects same-origin and restrict admin login redirects to `/admin` paths.

## Safety Constraints

- Do not add `middleware.ts` unless verification shows `proxy.ts` is not invoked.
- Do not weaken existing cookie flags.
- Do not change admin session token design in this wave; that belongs to Wave 2.
- Treat the Supabase auth callback redirect as hardening, not as a confirmed external redirect unless a failing test proves it.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- Admin login with `?next=/admin/providers` stays internal.
- Admin login with `?next=https://example.com` falls back to `/admin`.
- Admin login with `?next=//example.com` falls back to `/admin`.
- Auth callback redirect helper rejects external/protocol-relative values.
- Document whether `/admin` unauthenticated is intercepted by `proxy.ts` in Next 16.

## Suggested Agent Prompt

Use this markdown file as the implementation contract. First verify whether `app/src/proxy.ts` is an active Next 16 proxy. Then implement only safe redirect hardening. Do not change admin session design or add middleware unless verification proves it is needed.
