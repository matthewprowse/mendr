# Wave 5 Build Plan: Large Client And Admin Refactors

## Goal

Reduce bundle size and maintenance risk in large client modules after correctness, auth, rate-limit, and cleanup waves are complete.

## Source Reports

- `../consumer-ui/bundle-client-boundary-audit.md`
- `../contractor-provider-admin/admin-onboarding-auth-duplication-audit.md`

## Scope

Files this agent may edit:

- `app/src/app/diagnosis/client.tsx`
- `app/src/app/match/components/client.tsx`
- `app/src/app/start/client.tsx`
- `app/src/app/design/client.tsx`
- `app/src/app/processing/[conversationId]/client.tsx`
- New components/hooks under related route folders or `app/src/features/**`
- `app/src/app/admin/providers/client.tsx`
- New admin provider subcomponents/hooks under `app/src/app/admin/providers/**` or `app/src/app/admin/components/**`

Files this agent must not edit:

- Admin auth/session behavior
- API route contracts
- Diagnosis parser behavior
- Provider search backend behavior

## Tasks

Consumer bundle tasks:

- [ ] Dynamically import `heic2any` inside the HEIC conversion path.
- [ ] Dynamic-load `FilterSheet` only when open.
- [ ] Defer Google Maps initialization until user intent or viewport visibility.
- [ ] Dynamic-load Places autocomplete loader in the start location step.
- [ ] Replace `framer-motion` in processing with CSS transitions or a lazy child.
- [ ] Server-split static sections from `design/client.tsx`.

Admin refactor tasks:

- [ ] Split `admin/providers/client.tsx` by vertical concern.
- [ ] Extract applications queue component.
- [ ] Extract live providers table component.
- [ ] Extract provider edit/dialog components.
- [ ] Extract admin provider data hooks/API client helpers.

## Safety Constraints

- Do not change user-visible behavior in the same PR as extraction unless unavoidable.
- Prefer one vertical slice per PR.
- Preserve component props and route behavior.
- Do not combine consumer bundle work and admin provider split in one agent run unless explicitly requested.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- `/start` flow still reaches processing.
- `/processing/[conversationId]` still renders progress.
- `/diagnosis/[id]` still displays images and report content.
- `/match` and `/match/[id]` still load provider list and filters.
- `/design` still renders the preview page.
- `/admin/providers` still loads applications and live providers after auth.

## Suggested Agent Prompt

Pick one vertical slice from this plan and implement only that slice. Do not combine unrelated client/admin refactors. Preserve behavior, run build, and summarize any bundle/runtime improvement expected.
