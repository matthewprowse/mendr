# Admin, Onboarding, And Operations Audit

## Executive Summary

Admin authentication is duplicated across many API route modules through repeated `checkAdminCookie` implementations. The intended page-level admin guard in `app/src/proxy.ts` is not wired because the repo has no `middleware.ts`.

Provider onboarding has a canonical implementation under `contractors/network`, but legacy `pro/onboard` and `pro/application/edit` clients remain in the tree even though their pages redirect. The admin provider page is also a large monolith combining applications, live provider editing, dialogs, emails, and enrichment actions.

Two application progress/session routes need special attention: `application-progress` exposes unauthenticated deletion by ID, and `application-session` deletion weakens if caller IP is missing.

## Files And Routes Reviewed

| Area | Paths |
| --- | --- |
| Admin UI | `app/src/app/admin/**` |
| Admin APIs | `app/src/app/api/admin/**/route.ts` |
| Login | `app/src/app/api/admin/login/route.ts`, `app/src/app/admin/login/client.tsx` |
| Onboarding canonical | `app/src/app/contractors/network/client.tsx` |
| Onboarding legacy | `app/src/app/pro/onboard/client.tsx` |
| Application edit | `app/src/app/contractors/application/edit/**`, `app/src/app/pro/application/edit/**` |
| Provider application APIs | `api/providers/apply`, `application-session`, `application-progress`, `application-document` |
| Gallery/uploads | `api/admin/gallery`, provider application upload routes |
| Cross-cutting | `app/src/proxy.ts` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| CPA-AO-01 | High | High | `proxy.ts` is not imported and no `middleware.ts` exists. | Admin pages not protected by intended middleware. | Add real middleware or delete false-confidence proxy. |
| CPA-AO-02 | Medium | High | `checkAdminCookie` is copied across many `api/admin` routes. | Auth behavior can drift. | Extract shared `lib/admin-auth.ts`. |
| CPA-AO-03 | High | High | Admin cookie is base64 of `ADMIN_PASSWORD`. | Cookie theft is password-equivalent. | Use signed opaque session token. |
| CPA-AO-04 | Critical | Confirmed | `api/providers/application-progress/route.ts` DELETE handler accepts `{ id }` in the body and calls `admin.from('provider_applications').delete().eq('id', id)` with zero authentication, zero rate limit, and zero ownership check. Any caller who knows a UUID can permanently delete any provider application row. The GET handler also exposes full `provider_applications` rows (including sensitive fields) to any caller who matches a phone number or IP — no auth required. Both are public by accident. | Application records can be silently deleted by any party with a UUID. Application data is readable by phone/IP guessing. | If the route is part of the applicant resume flow: gate GET behind a short-lived signed token (e.g. sent in the confirmation email); require the same token on DELETE. If unused: delete the route entirely. |
| CPA-AO-05 | High | Medium | `application-session` DELETE only adds IP filter when IP exists. | Missing trusted IP can become id-only deletion. | Reject deletion if binding context is missing; require phone/session token. |
| CPA-AO-06 | Medium | High | `application-progress` and `application-session` implement overlapping resume/progress concepts differently. | Inconsistent behavior and stale route risk. | Choose one canonical route and remove/deprecate the other. |
| CPA-AO-07 | Low | High | `pro/onboard/page.tsx` redirects; `pro/onboard/client.tsx` remains large and unused. | Maintainers may edit dead onboarding client. | Delete legacy client after import verification. |
| CPA-AO-08 | Low | High | `pro/application/edit/page.tsx` redirects; legacy client remains. | Duplicate with contractors edit client. | Delete legacy client. |
| CPA-AO-09 | Medium | High | `api/pro/application/edit/route.ts` duplicates contractors edit route. | Drift risk. | Delete or re-export canonical route. |
| CPA-AO-10 | Medium | High | `admin/providers/client.tsx` is about 1,600 lines and mixes multiple workflows. | High review/regression cost. | Split by applications, live providers, dialogs, and API hooks. |
| CPA-AO-11 | Medium | Medium | Provider application document uploads are public-ish with service role after rate limit only. | Storage/cost/moderation risk. | Add stricter quotas, MIME validation, lifecycle, and optional CAPTCHA. |
| CPA-AO-12 | Low | High | `admin/_components` are deprecated re-export shims. | Minor import noise. | Delete after import migration. |

## Admin Auth Duplication Inventory

Repeated cookie check pattern appears in:

- `api/admin/stats/route.ts`
- `api/admin/providers/route.ts`
- `api/admin/providers/live/route.ts`
- `api/admin/gallery/route.ts`
- `api/admin/reviews/route.ts`
- `api/admin/contact/route.ts`
- `api/admin/analytics/route.ts`
- `api/admin/send-email/route.ts`
- `api/admin/send-reply/route.ts`
- `api/admin/provider-applications/send-invitation/route.ts`
- `api/admin/provider-applications/resend-confirmation/route.ts`

Shared helper target:

```text
app/src/lib/admin-auth.ts
  verifyAdminCookie(req)
  requireAdmin(req)
  createAdminSessionCookie(...)
  clearAdminSessionCookie(...)
```

## Onboarding And Application Flow Duplication

| Flow | Canonical | Legacy/duplicate |
| --- | --- | --- |
| Provider landing | `/contractors` | `/pro/join` client remains but route redirects |
| Onboarding | `/contractors/network` | `/pro/onboard/client.tsx` |
| Application edit UI | `/contractors/application/edit` | `/pro/application/edit/client.tsx` |
| Application edit API | `/api/contractors/application/edit` | `/api/pro/application/edit` |
| Resume/progress | `application-session` | `application-progress` |

## Operations And Observability Gaps

- No consistent request/application correlation ID from apply through cron, email, invitation, and admin actions.
- Fire-and-forget Supabase updates make status hard to observe.
- Admin dashboard polling may hide auth failures as empty state if not surfaced clearly.
- Large admin live provider queries and event pulls need timing metrics.
- Gallery moderation lacks clear audit trail of who approved/rejected.

## Suggested PR-Sized Fixes

1. **Admin auth helper**: extract and replace all duplicate `checkAdminCookie` functions.
2. **Middleware wiring**: add real admin middleware or remove `proxy.ts`.
3. **Application-progress hardening**: delete if unused or require signed/authenticated context.
4. **Application-session DELETE hardening**: require phone/session/IP binding and reject missing context.
5. **Legacy onboarding cleanup**: delete `pro/onboard/client.tsx` and `pro/application/edit/client.tsx` once redirects are confirmed.
6. **Applicant edit API dedupe**: delete or re-export `api/pro/application/edit`.
7. **Admin providers split**: extract application queue, live providers, dialogs, and data hooks from `admin/providers/client.tsx`.
8. **Observability pass**: add request/application IDs and structured logs for apply/cron/admin operations.
