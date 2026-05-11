# `/pro` To `/contractors` Migration Audit

## Executive Summary

`/contractors/*` is the canonical provider/contractor surface. `app/next.config.ts` permanently redirects the main legacy `/pro/*` URLs to `/contractors/*`, but the bare `/pro` route is not covered by config redirects and currently redirects to `/match`.

Most of `app/src/app/pro/**` is unreachable in normal production routing. The legacy tree has large client files, duplicated components, and many `* 2.*` shims, while live contractor routes use `app/src/app/contractors/**`. One live stale URL remains in `app/src/app/chat/components/providers-map.tsx`, which builds provider links under `/pro/[id]`.

## Route And Redirect Map

| Source | Destination | Location |
| --- | --- | --- |
| `/pro/join` | `/contractors` | `app/next.config.ts` |
| `/pro/onboard` | `/contractors/network` | `app/next.config.ts` |
| `/pro/application/edit` | `/contractors/application/edit` | `app/next.config.ts` |
| `/pro/:id` | `/contractors/:id` | `app/next.config.ts` |
| `/api/pro/application/edit` | `/api/contractors/application/edit` | `app/next.config.ts` |
| `/pro` | `/match` | `app/src/app/pro/page.tsx` |

## Files And Components Reviewed

| Area | Paths |
| --- | --- |
| Redirects | `app/next.config.ts` |
| Metadata | `app/src/lib/site-metadata.ts`, `app/src/app/sitemap.ts`, `app/src/app/robots.ts` |
| Legacy pro | `app/src/app/pro/**` |
| Contractor canonical | `app/src/app/contractors/**` |
| API legacy | `app/src/app/api/pro/application/edit/route.ts` |
| API canonical | `app/src/app/api/contractors/application/edit/route.ts` |
| Stale URL caller | `app/src/app/chat/components/providers-map.tsx` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| CPA-PC-01 | High | High | `next.config.ts` does not redirect bare `/pro`; `pro/page.tsx` redirects to `/match`. | Bare `/pro` contradicts canonical contractor migration. | Add `/pro -> /contractors` redirect if product intent is contractor landing. |
| CPA-PC-02 | Medium | High | `providers-map.tsx` builds URLs as `/pro/${id}`. | Extra 301 hop and stale copied/share URLs. | Change to `/contractors/${id}`. |
| CPA-PC-03 | Medium | High | `app/src/app/pro/**` is a mostly closed graph and route pages redirect before clients render. | Large dead maintenance tree. | Delete or reduce to redirect-only stubs after traffic audit. |
| CPA-PC-04 | Low | High | `api/pro/application/edit/route.ts` duplicates contractors route and is covered by redirect. | Drift risk. | Delete or re-export canonical handlers. |
| CPA-PC-05 | Low | High | `pro/join/layout.tsx` canonical/openGraph URL uses `/pro/join`. | Stale metadata if ever rendered locally or without redirects. | Delete or align with `/contractors`. |
| CPA-PC-06 | Low | High | Comments in provider/match/chat code still reference `/pro/[id]`. | Maintainer confusion. | Update comments to `/contractors/[id]`. |
| CPA-PC-07 | Low | High | `lib/pro-join-faq.ts` references `/pro/join` and appears unused. Verified: no imports found in the codebase. | Stale copy and dead lib. | Delete. |
| CPA-PC-08 | Medium | Confirmed | `app/src/app/pro/[id]/components/sticky-footer.tsx` hardcodes `<a href="/scan/new">`. The `/scan` route does not exist anywhere in the App Router tree. | Any user reaching this component via a legacy `/pro/:id` URL sees a broken "new scan" link. | Change to `/start`. This file will be deleted with the broader `/pro` tree cleanup, but should be patched immediately if the pro tree receives any traffic before that PR lands. |

## Unreachable Or Dead Pro Inventory

Strong candidates:

- `app/src/app/pro/join/client.tsx`
- `app/src/app/pro/onboard/client.tsx`
- `app/src/app/pro/application/edit/client.tsx`
- `app/src/app/pro/[id]/pro-provider-client-page.tsx`
- `app/src/app/pro/legacy-pro-client-page.tsx`
- `app/src/app/pro/_components/*`
- `app/src/app/pro/**/* 2.tsx`
- `app/src/app/api/pro/application/edit/route.ts`

Reasoning:

- Config redirects cover the main public `/pro/*` paths.
- Route files themselves redirect to contractor equivalents.
- Contractor code imports from `app/src/app/contractors`, not `app/src/app/pro`.

## Stale URL Inventory

| Location | Stale reference | Action |
| --- | --- | --- |
| `chat/components/providers-map.tsx` | `/pro/${id}` | Change to `/contractors/${id}` — verified at line 458 |
| `pro/[id]/components/sticky-footer.tsx` | `/scan/new` | Change to `/start` — `/scan` route does not exist |
| `pro/join/client.tsx` | `/pro/onboard`, `/pro/join` links | Delete with pro tree |
| `pro/onboard/client.tsx` | `/pro/join` pushes | Delete with pro tree |
| `pro/join/layout.tsx` | canonical `/pro/join` | Delete or align |
| `lib/pro-join-faq.ts` | `/pro/join` docstring | Move/delete |
| Provider handler comments | `/pro/[id]` | Update comments |

## Recommended Redirect-Only Retention Strategy

Keep permanent redirects in `next.config.ts` for old bookmarks and emails, but remove the code implementation for old pages once config covers all desired legacy URLs.

Add missing root redirect:

```text
/pro -> /contractors
```

Then delete legacy UI tree in a mechanical PR.

## Suggested PR-Sized Fixes

1. **Behavior and URL fix**: add `/pro -> /contractors`; update `providers-map.tsx` to `/contractors`.
2. **Duplicate API cleanup**: remove or re-export `api/pro/application/edit`.
3. **Legacy tree deletion**: remove `app/src/app/pro/**` after traffic/import verification.
4. **Comments and docs**: update stale `/pro/[id]` references and resolve `pro-join-faq.ts`.
5. **Regression checks**: smoke test `/pro`, `/pro/join`, `/pro/onboard`, `/pro/application/edit`, `/pro/<id>`, and `/api/pro/application/edit`.
