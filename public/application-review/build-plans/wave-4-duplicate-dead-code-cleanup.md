# Wave 4 Build Plan: Duplicate And Dead Code Cleanup

## Goal

Remove confirmed duplicate, shim, and dead route files after verifying they have no live imports.

## Source Reports

- `../consumer-ui/route-dead-code-audit.md`
- `../consumer-ui/shared-ui-state-duplication-audit.md`
- `../contractor-provider-admin/admin-onboarding-auth-duplication-audit.md`
- `../core-api-runtime/api-contract-correctness-audit.md`

## Scope

Files this agent may edit/delete:

- `app/src/components/ui/select 2.tsx`
- `app/src/features/match/hooks/useMatch* 2.ts`
- Deprecated match hook shims if unused
- `app/src/app/chat/components/* 2.*`
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
- `app/src/app/welcome2/page.tsx` only if replaced by redirect or confirmed removable
- `app/src/app/api/welcome-upload-image/route.ts`

Files this agent must not edit:

- Active route behavior files unless converting an obsolete route to a redirect
- Admin auth/session files
- Provider search handler
- Diagnosis parser files

## Tasks

- [ ] For every deletion candidate, prove zero usage with `rg`.
- [ ] Delete re-export-only `* 2.*` files with zero imports.
- [ ] Delete deprecated shim folders with zero imports.
- [ ] Delete dead dynamic-route clients after verifying active pages use parent clients.
- [ ] Delete or redirect stub routes like `welcome2` only if product agrees.
- [ ] Delete `welcome-upload-image` only after confirming clients use `upload-image`.
- [ ] Add or update comments only where they prevent future confusion.

## Safety Constraints

- Do not delete files based on filename alone.
- Do not change active user-facing redirects except where this plan explicitly says so.
- Keep deletion PRs small; if the diff becomes too large, split by folder.
- Run build after deletion.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- `rg " 2\\.(ts|tsx)" app/src` returns zero or only intentional files.
- `rg "@/app/chat/_components|app/chat/_components" app/src` returns zero.
- `rg "@/app/admin/_components|app/admin/_components" app/src` returns zero.
- `/match`, `/match/[id]`, `/diagnosis`, `/diagnosis/[id]`, `/start` still build.

## Suggested Agent Prompt

This is a deletion-heavy cleanup. Work mechanically. Before deleting each file, prove it is unused. Do not fix unrelated bugs or refactor active code. Return a deletion list with the evidence command/result for each group.
