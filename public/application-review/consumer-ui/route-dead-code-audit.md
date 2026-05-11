# Route Dead Code Audit

## Executive Summary

This audit reviewed consumer App Router routes under `app/src/app`, excluding `api`, `admin`, `contractors`, and `pro`. The highest-confidence bug is `app/src/app/chat/page.tsx`: `/chat?id=...` redirects to `/scan/...`, but there is no `scan` route and no redirect/rewrite for `/scan` in `app/next.config.ts`.

The consumer route tree also contains several redirect or stub routes with nearby orphan clients: `welcome`, `welcome2`, `match2`, `diagnosis2`, `match/[id]`, and `diagnosis/[id]`. These are good cleanup candidates once product confirms no external links depend on the old paths.

## Files And Routes Reviewed

| Route | File | Current behavior |
| --- | --- | --- |
| `/chat` | `app/src/app/chat/page.tsx` | Redirects `?id=` to `/scan/[id]`, otherwise `/` |
| `/welcome` | `app/src/app/welcome/page.tsx` | Redirects to `/start`; also redirected by `next.config.ts` |
| `/welcome2` | `app/src/app/welcome2/page.tsx` | Placeholder page |
| `/landing` | `app/src/app/landing/page.tsx` | Redirects to `/` |
| `/landing1` | `app/src/app/landing1/page.tsx` | Active landing client |
| `/match2` | `app/src/app/match2/page.tsx` | Redirects to `/start` |
| `/diagnosis2` | `app/src/app/diagnosis2/page.tsx` | Redirects to `/start` |
| `/contact` | `app/src/app/contact/page.tsx` | Redirects to `/landing1#contact` |
| `/match/[id]` | `app/src/app/match/[id]/page.tsx` | Dynamically imports `../client` |
| `/diagnosis/[id]` | `app/src/app/diagnosis/[id]/page.tsx` | Imports `../client` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| UI-RD-01 | Critical | High | `app/src/app/chat/page.tsx` redirects to `/scan/${params.id}`; no `app/src/app/scan` route exists; `next.config.ts` has no `/scan` redirect. Additionally, `app/src/app/pro/[id]/components/sticky-footer.tsx` hardcodes an `<a href="/scan/new">` link — also broken. | Legacy chat links with `id` redirect to 404; the sticky-footer "new scan" link is also broken. | For `/chat?id`, redirect to `/diagnosis/[id]` — that is the confirmed canonical route for a scan/conversation. For `/scan/new`, change to `/start` (the entry point). |
| UI-RD-02 | Medium | High | `app/src/app/match/[id]/page.tsx` imports `../client`, while `app/src/app/match/[id]/match-page-client.tsx` exists separately. | Alternate implementation can drift and confuse maintainers. | Delete or archive `match/[id]/match-page-client.tsx` after import verification. |
| UI-RD-03 | Medium | High | `app/src/app/diagnosis/[id]/page.tsx` imports `../client`; route-local `client.tsx` and `diagnosis-page-client.tsx` exist separately. | Duplicate diagnosis clients increase regression risk and review cost. | Remove stale route-local clients after final `rg` verification. |
| UI-RD-04 | Medium | Medium-High | `app/src/app/welcome/page.tsx` redirects to `/start`; `welcome/client.tsx` and `welcome/welcome-client.tsx` are not used by that page. | Likely dead client code around an already-migrated flow. | Verify imports, then delete or migrate any still-needed helpers into `/start`. |
| UI-RD-05 | Low | High | `app/next.config.ts` already redirects `/welcome` to `/start`; `app/src/app/welcome/page.tsx` also redirects. | Redundant routing policy. | Keep one redirect mechanism and remove redundant route code if safe. |
| UI-RD-06 | Low | High | `app/src/app/welcome2/page.tsx` is a placeholder. | Public stub URL adds product and SEO noise. | Remove, redirect, or gate as dev-only. |
| UI-RD-07 | Low | High | `match2/page.tsx` and `diagnosis2/page.tsx` redirect to `/start`; sibling client files are comment-only. | Route clutter and stale implementation signals. | Delete comment-only clients; keep minimal redirects only if external links exist. |
| UI-RD-08 | Medium | Medium | `app/src/app/contact/page.tsx` redirects to `/landing1#contact`; `sitemap.ts` still lists `/contact` at `priority: 0.75`. | Sitemap directs crawlers to a redirecting URL; hash anchors are not indexable. | Remove `/contact` from `sitemap.ts`; ensure `/landing1` is the canonical contact destination. The redirect page itself can remain for backward compatibility. |
| UI-RD-09 | Low | High | `app/src/lib/site-metadata.ts` comments say `/diagnosis` redirects to `/start`, but `diagnosis/page.tsx` renders a client. | Maintainers may rely on stale routing notes. | Update comments to match actual behavior. |
| UI-RD-10 | Low | High | `app/src/app/landing/page.tsx` redirects to `/`; no audit entry existed for this stub. | Public URL with zero content; minor SEO noise. | Confirm no inbound links depend on `/landing`; keep redirect stub or remove. |

## Confirmed Bugs

### `/chat?id` Redirects To A Missing Route

`app/src/app/chat/page.tsx` sends `id` traffic to `/scan/[id]`. There is no matching App Router segment and no config redirect. This should be treated as a user-facing broken link until proven no inbound traffic uses `/chat?id=...`.

**Verified fix:** change redirect destination to `/diagnosis/${params.id}`. The `/diagnosis/[id]` route is confirmed to exist and is the canonical scan/conversation route. The `/scan` path does not exist anywhere in the App Router tree.

**Also found:** `app/src/app/pro/[id]/components/sticky-footer.tsx` hardcodes `<a href="/scan/new">Start a new scan</a>`. Since `/scan` does not exist, this link is broken. Change to `/start`.

### Active Dynamic Routes Ignore Route-Local Clients

`/match/[id]` and `/diagnosis/[id]` both route through parent clients, leaving route-local clients as dead or obsolete candidates. This is not a runtime bug by itself, but it creates confusing ownership.

## Unused Or Obsolete Candidates

### Confirmed Or Strong Candidates

- `app/src/app/match/match-page-client.tsx`: explicitly marked as dead and exports nothing.
- `app/src/app/match/[id]/match-page-client.tsx`: active route dynamically imports `../client`.
- `app/src/app/diagnosis/[id]/client.tsx`: active route imports `../client`.
- `app/src/app/diagnosis/[id]/diagnosis-page-client.tsx`: active route imports `../client`.
- `app/src/app/match2/client.tsx`: comment-only with redirecting page.
- `app/src/app/diagnosis2/client.tsx`: comment-only with redirecting page.

### Verify Before Deleting

- `app/src/app/welcome/client.tsx`
- `app/src/app/welcome/welcome-client.tsx`
- `app/src/app/contact/client.tsx`

Verification steps:

- Run repo-wide import search for each filename and exported symbol.
- Check for string-based dynamic imports.
- Smoke test `/welcome`, `/contact`, `/match/[id]`, `/diagnosis/[id]`, `/match2`, `/diagnosis2`, and `/chat?id=<known-id>`.

## Redundancy Map

```text
/welcome
  next.config redirect -> /start
  app route redirect -> /start
  leftover clients -> likely obsolete

/match/[id]
  active page -> ../client
  stale route-local match-page-client.tsx

/diagnosis/[id]
  active page -> ../client
  stale route-local client.tsx and diagnosis-page-client.tsx

/chat?id=...
  active page -> /scan/[id]
  missing /scan route

/match2 and /diagnosis2
  redirect-only routes
  comment-only clients
```

## Suggested PR-Sized Fixes

1. **Fix `/chat?id` redirect**: decide canonical destination and update `app/src/app/chat/page.tsx`; add a smoke test.
2. **Delete confirmed dead route clients**: remove `match/match-page-client.tsx`, comment-only `match2`/`diagnosis2` clients, and stale dynamic-route clients after import checks.
3. **Resolve `/contact` canonical strategy**: either render `/contact` directly or make `/landing1` the canonical destination and update sitemap/nav.
4. **Clean routing comments and stubs**: update `site-metadata.ts`; decide whether `/welcome2` stays, redirects, or is removed.
