# Wave 1 Build Plan: Routing And API Contract Fixes

## Goal

Fix confirmed broken user-facing routes and API method/contract mismatches without touching broad cleanup or refactor work.

## Source Reports

- `../consumer-ui/route-dead-code-audit.md`
- `../core-api-runtime/api-contract-correctness-audit.md`
- `../contractor-provider-admin/provider-search-review-api-audit.md`

## Scope

Files this agent may edit:

- `app/src/app/chat/page.tsx`
- `app/src/app/api/cron/process-provider-applications/route.ts`
- `app/src/app/api/providers/apply/route.ts` only if needed for the cron method fix
- `app/src/app/contractors/[id]/components/review-form.tsx`
- `app/src/app/pro/[id]/components/review-form.tsx`
- `app/src/app/pro/[id]/components/sticky-footer.tsx`
- `app/src/app/page/components/coverage-map.tsx`
- `app/src/app/page/_components/coverage-map.tsx`
- New route only if implementing coverage: `app/src/app/api/providers/coverage/route.ts`

Files this agent must not edit:

- Admin auth/session files
- Diagnosis/AI pipeline files
- Large provider search internals except for explicitly adding a coverage route
- Any delete-heavy cleanup outside the files above

## Tasks

- [ ] Fix `/chat?id=...` so it redirects to an existing canonical route, preferably `/diagnosis/[id]` if the `id` is a diagnosis/conversation id.
- [ ] Fix `/scan/new` in `app/src/app/pro/[id]/components/sticky-footer.tsx` to point to `/start`.
- [ ] Fix the provider application trigger mismatch by adding `POST` to `process-provider-applications` that delegates to the same logic as `GET`, or by changing the trigger to `GET`.
- [ ] Resolve stale review forms: either delete if confirmed unused, or point them to `/api/reviews` with the canonical camelCase payload.
- [ ] Resolve coverage map: either implement `POST /api/providers/coverage` or remove/repoint both coverage map components.

## Safety Constraints

- Do not delete files unless `rg` proves there are no imports/usages.
- Preserve existing scheduled Vercel cron behavior.
- Keep the cron `Authorization: Bearer ${CRON_SECRET}` check intact.
- Do not refactor `api/providers/handler.ts` in this wave.
- If coverage map implementation is non-trivial, prefer disabling/removing the broken UI over adding a complex provider endpoint.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- `/chat?id=test-id` redirects to an existing route.
- `/scan/new` no longer appears in `app/src`.
- `POST /api/cron/process-provider-applications` no longer 405s when authorized.
- Review form path either no longer exists or posts to `/api/reviews`.
- No code references `/api/providers/coverage` unless that route exists.

## Suggested Agent Prompt

Use this markdown file and the source reports as the implementation contract. Make only the routing/API contract fixes listed here. Do not perform cleanup outside the allowed scope. Before deleting anything, prove it is unused with `rg`. Return files changed, validation run, and residual risks.
