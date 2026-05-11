# Wave 4 Build Plan: Provider Search And Review Cleanup

## Goal

Remove obsolete provider search implementations and consolidate provider review API usage after immediate route-contract fixes are complete.

## Source Reports

- `../contractor-provider-admin/provider-search-review-api-audit.md`
- `../core-api-runtime/api-contract-correctness-audit.md`

## Scope

Files this agent may edit:

- `app/src/app/api/providers/providers-route.ts`
- `app/src/app/api/providers/providers-route-constants.ts`
- `app/src/app/api/providers/constants.ts`
- `app/src/app/api/providers/onboarding/search/route.ts`
- `app/src/app/api/providers/handler.ts` only for comments or imports related to removed duplicates
- `app/src/app/contractors/hooks/reviews.ts`
- `app/src/app/contractors/hooks/use-reviews.ts`
- `app/src/app/contractors/[id]/components/review-form.tsx`
- `app/src/app/pro/[id]/components/review-form.tsx`

Files this agent must not edit:

- Provider search behavior in active `handler.ts` except to remove stale references
- Admin auth files
- Contractor UI beyond stale review components/hooks

## Tasks

- [ ] Confirm `providers-route.ts` has no production importers.
- [ ] Delete `providers-route.ts` if unused.
- [ ] Consolidate `providers-route-constants.ts` into `constants.ts`; update onboarding search import.
- [ ] Delete unused duplicate review hooks/components after import verification.
- [ ] Ensure canonical review submission path is `POST /api/reviews`.
- [ ] Update stale comments that mention obsolete provider route behavior.

## Safety Constraints

- Do not modify active provider search logic in `handler.ts` unless necessary for import cleanup.
- Do not change review moderation/admin behavior.
- Do not delete a route/component used by contractor profile pages without replacing the import.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- `rg "providers-route" app/src` returns zero or only docs after deletion.
- `rg "providers-route-constants" app/src` returns zero.
- `rg "/api/providers/\\$\\{providerId\\}/reviews|/api/providers/.*/reviews" app/src` returns zero unless a real route exists.
- Contractor review submission still uses `/api/reviews`.

## Suggested Agent Prompt

Implement only provider duplicate cleanup and review API consolidation. Do not refactor the large active provider handler. Prove every deleted file is unused and run build afterwards.
