# Wave 4a — `/pro` To `/contractors` Cleanup

## Progress
**Status:** ✅ Complete  
**Tasks:** 6 / 6 complete

---

## Goal
Finish the legacy `/pro` migration — add missing root redirect, fix stale URLs, remove dead legacy tree.

## Scope
- `app/next.config.ts`
- `app/src/app/chat/components/providers-map.tsx`
- `app/src/app/pro/**` (deletions)
- `app/src/app/api/pro/application/edit/route.ts` (delete)
- `app/src/lib/pro-join-faq.ts` (delete)

**Do NOT edit:** canonical `contractors/**`, admin auth, diagnosis/AI code.

## Tasks
- [x] Add `/pro → /contractors` permanent redirect to `next.config.ts` — inserted before `/pro/join` entry
- [x] Update `providers-map.tsx` line 458: `/pro/${id}` → `/contractors/${id}`
- [x] Delete `lib/pro-join-faq.ts` — confirmed zero imports
- [x] Delete `api/pro/application/edit/route.ts` and `api/pro/` directory — confirmed zero external imports
- [x] Delete `app/src/app/pro/**` legacy client tree — confirmed all imports were internal-only; zero external consumers
- [x] Update stale `/pro/[id]` comments → `/contractors/[id]` in `types.ts`, `match/client.tsx`, `providers-route.ts` (2×), `handler.ts` (3×)

## Safety Constraints
- Keep all existing `next.config.ts` permanent redirects (keep `/pro/join`, `/pro/onboard` etc.)
- Run `rg "@/app/pro|from.*app/pro"` before any `pro/**` deletion
- Do NOT delete canonical contractor files

## Verification Checklist
- [ ] `/pro` → redirects to `/contractors`
- [ ] `/pro/join`, `/pro/onboard`, `/pro/:id` still redirect correctly via config
- [ ] `rg '"/pro/' app/src` → zero live links (only redirect config)
- [ ] `rg "@/app/pro" app/src` → zero imports
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
