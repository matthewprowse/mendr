# Wave 5b — Large Client And Admin Refactors

## Progress
**Status:** ⏸ Deferred (after Waves 1-4 complete)  
**Tasks:** 0 / 10 complete

---

## Goal
Reduce bundle size and maintenance risk in large client modules.

## Scope
Consumer bundle:
- `app/src/app/diagnosis/client.tsx`
- `app/src/app/match/components/client.tsx`
- `app/src/app/start/client.tsx`
- `app/src/app/processing/[conversationId]/client.tsx`
- `app/src/app/design/client.tsx`

Admin split:
- `app/src/app/admin/providers/client.tsx`
- New subcomponents under `app/src/app/admin/providers/**`

**Do NOT edit:** admin auth behavior, API route contracts, diagnosis parser, provider search backend.

## Tasks
Consumer bundle:
- [ ] Dynamic import `heic2any` inside conversion function in `diagnosis/client.tsx`
- [ ] Dynamic-load `FilterSheet` only when open in `match/components/client.tsx`
- [ ] Defer Google Maps init until user intent/viewport visibility in `use-match-map.ts`
- [ ] Dynamic-load Places autocomplete in the start location step only
- [ ] Replace `framer-motion` in `processing/client.tsx` with CSS transitions

Admin split:
- [ ] Extract `ApplicationQueueSection` from `admin/providers/client.tsx`
- [ ] Extract `LiveProvidersTable` from `admin/providers/client.tsx`
- [ ] Extract `ProviderEditDialog` from `admin/providers/client.tsx`
- [ ] Extract `AdminProviderDataHooks` into separate hook file
- [ ] Server-split static sections from `design/client.tsx`

## Verification Checklist
- [ ] `/start`, `/processing`, `/diagnosis`, `/match`, `/design` all build
- [ ] `/admin/providers` still loads after split
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
