# Wave 4 Build Plan: `/pro` To `/contractors` Cleanup

## Goal

Finish the legacy `/pro` to canonical `/contractors` migration while preserving backwards-compatible redirects.

## Source Reports

- `../contractor-provider-admin/pro-contractors-migration-audit.md`
- `../contractor-provider-admin/admin-onboarding-auth-duplication-audit.md`

## Scope

Files this agent may edit:

- `app/next.config.ts`
- `app/src/app/chat/components/providers-map.tsx`
- `app/src/app/pro/**`
- `app/src/app/api/pro/application/edit/route.ts`
- `app/src/lib/pro-join-faq.ts`
- Comments referencing `/pro/[id]` in provider/match/chat files

Files this agent must not edit:

- Canonical `app/src/app/contractors/**` implementations except for import/comment updates required by deletion
- Admin auth/session files
- Provider search logic
- Diagnosis/AI code

## Tasks

- [ ] Add `/pro -> /contractors` redirect if product intent is confirmed.
- [ ] Update live `/pro` provider links to `/contractors`.
- [ ] Remove or shrink legacy `app/src/app/pro/**` tree after import verification.
- [ ] Remove or re-export `api/pro/application/edit`.
- [ ] Delete `lib/pro-join-faq.ts` if import search confirms it is unused.
- [ ] Update stale `/pro/[id]` comments to `/contractors/[id]`.

## Safety Constraints

- Keep `next.config.ts` redirects for legacy URLs indefinitely unless explicitly told otherwise.
- Do not delete canonical contractor files.
- Before deleting `pro/**`, run import searches for `@/app/pro`, relative `../pro`, and string paths if relevant.
- Do not combine with review API or provider handler changes.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- `/pro`, `/pro/join`, `/pro/onboard`, `/pro/application/edit`, and `/pro/<id>` redirect correctly.
- `/contractors`, `/contractors/network`, `/contractors/application/edit`, `/contractors/<id>` still build.
- `rg "/pro/" app/src` only returns intentional redirects/docs, not live links.
- `rg "@/app/pro|from ['\\\"].*app/pro" app/src` is zero after deletion.

## Suggested Agent Prompt

Use this build plan as the only implementation scope. Finish legacy pro cleanup while preserving redirects. Do not touch contractor logic except where imports/comments require updates. Prove no imports before deleting files.
