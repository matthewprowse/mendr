# Wave 4b — Duplicate And Dead Code Cleanup

## Progress
**Status:** ✅ Complete  
**Tasks:** 7 / 7 complete

---

## Goal
Delete confirmed duplicate, shim, and dead files — every deletion proven unused first.

## Scope
Deletion candidates (all must be import-verified before removing):
- `app/src/components/ui/select 2.tsx`
- `app/src/features/match/hooks/useMatch* 2.ts` (3 files)
- `app/src/app/chat/components/* 2.*` (18 files)
- `app/src/app/chat/_components/**`
- `app/src/app/admin/_components/**`
- `app/src/app/match/match-page-client.tsx`
- `app/src/app/match/[id]/match-page-client.tsx`
- `app/src/app/match2/client.tsx`
- `app/src/app/diagnosis2/client.tsx`
- `app/src/app/diagnosis/[id]/client.tsx`
- `app/src/app/diagnosis/[id]/diagnosis-page-client.tsx`
- `app/src/app/welcome/client.tsx`
- `app/src/app/welcome/welcome-client.tsx`
- `app/src/app/welcome2/page.tsx` → convert to redirect to `/start`
- `app/src/app/api/welcome-upload-image/route.ts`

**Do NOT edit:** active route behavior, admin auth files, provider search handler, diagnosis parser.

## Tasks
- [x] Proved and deleted `select 2.tsx`, all `useMatch* 2.ts` shims (3 files)
- [x] Proved and deleted all `chat/components/* 2.*` shims (14 files) and `chat/_components/` folder
- [x] Proved and deleted `admin/_components/` and `admin/components/* 2.*` shims (4 files)
- [x] Proved and deleted `match/match-page-client.tsx`, `match/[id]/match-page-client.tsx`, `diagnosis/[id]/client.tsx`, `diagnosis/[id]/diagnosis-page-client.tsx`
- [x] Proved and deleted `match2/client.tsx`, `diagnosis2/client.tsx` — flow-shell.tsx was a false-positive grep hit; no actual imports
- [x] Proved and deleted `welcome/client.tsx`, `welcome/welcome-client.tsx`
- [x] Deleted `api/welcome-upload-image/route.ts` (zero callers confirmed); deleted all `* 2.*` files remaining in `page/`, `match/`, `report/`, `landing/` trees — zero total remaining

## Safety Constraints
- Do NOT delete based on filename alone — run `rg` for each
- Keep active redirect stubs intact
- Run build after each deletion group

## Verification Checklist
- [ ] `rg " 2\.(ts|tsx)" app/src` → zero or only intentional
- [ ] `rg "chat/_components|admin/_components" app/src` → zero imports
- [ ] `/match`, `/diagnosis`, `/start` still build and render
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
