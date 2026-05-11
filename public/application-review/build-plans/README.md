# Application Review Build Plans

## Purpose

These files convert the audit reports in `app/public/application-review` into implementation-ready work packets. The goal is to let multiple agents work safely without stepping on each other or turning the review into one risky mega-refactor.

Audit reports describe problems. Build plans define:

- edit ownership
- execution order
- safety constraints
- validation
- agent prompts
- expected PR boundaries

## Build Plan Files

| Wave | Plan | Can run in parallel with |
| --- | --- | --- |
| 1 | `wave-1-routing-contracts.md` | `wave-1-safe-redirects-proxy-verification.md` |
| 1 | `wave-1-safe-redirects-proxy-verification.md` | `wave-1-routing-contracts.md` |
| 2 | `wave-2-admin-auth-sessions.md` | Run alone |
| 3 | `wave-3-rate-limits-public-abuse.md` | `wave-3-ai-timeouts-quotas.md` if both avoid `parts-prices/route.ts` overlap coordination issues |
| 3 | `wave-3-ai-timeouts-quotas.md` | `wave-3-rate-limits-public-abuse.md` with file ownership coordination |
| 4 | `wave-4-pro-contractors-cleanup.md` | `wave-4-duplicate-dead-code-cleanup.md` after checking no overlapping `pro` deletes |
| 4 | `wave-4-duplicate-dead-code-cleanup.md` | `wave-4-provider-search-review-cleanup.md` |
| 4 | `wave-4-provider-search-review-cleanup.md` | `wave-4-duplicate-dead-code-cleanup.md` |
| 5 | `wave-5-diagnosis-parser-contracts.md` | Run alone |
| 5 | `wave-5-large-client-and-admin-refactors.md` | Split into one vertical slice per agent |

## Recommended Execution Order

### Wave 1: Broken Contracts

Start here. These are targeted fixes for known broken route/API behavior.

Run in parallel:

1. `wave-1-routing-contracts.md`
2. `wave-1-safe-redirects-proxy-verification.md`

Important note: because this app uses Next 16, `app/src/proxy.ts` may already be the correct middleware convention. Agents must verify before adding `middleware.ts`.

### Wave 2: Admin Auth

Run one agent only:

1. `wave-2-admin-auth-sessions.md`

This touches many admin API routes and should not run alongside other admin work.

### Wave 3: Cost And Reliability

Run cautiously in parallel:

1. `wave-3-rate-limits-public-abuse.md`
2. `wave-3-ai-timeouts-quotas.md`

Coordinate ownership of `app/src/app/api/parts-prices/route.ts` because both plans may need to touch it. If there is any conflict, run rate limits first, then AI timeouts.

### Wave 4: Cleanup

Run after Waves 1-3 are merged and green.

Possible parallel agents:

1. `wave-4-pro-contractors-cleanup.md`
2. `wave-4-duplicate-dead-code-cleanup.md`
3. `wave-4-provider-search-review-cleanup.md`

These are deletion-heavy. Require import evidence before deleting files.

### Wave 5: Structural Refactors

Run last.

1. `wave-5-diagnosis-parser-contracts.md`
2. `wave-5-large-client-and-admin-refactors.md`

The large-client/admin refactor plan should be split into smaller vertical slices before handing it to an implementation agent.

## Global Agent Rules

Every implementation agent must follow these rules:

1. Edit only files listed in the build plan scope.
2. Do not edit audit reports or this build-plan README unless explicitly asked.
3. Do not delete files without a usage search.
4. Do not combine unrelated waves.
5. Do not change database schema unless the build plan explicitly allows it.
6. Preserve public response shapes unless the build plan explicitly changes a contract.
7. Run validation from `app`:
   - `npm run lint`
   - `npm run build`
8. If validation cannot be run, explain why and list exact commands that remain.

## Standard Agent Prompt

Use this prompt template when launching an implementation agent:

```text
Use the build plan at app/public/application-review/build-plans/<plan>.md as your implementation contract.

Implement only the tasks in that file.
Do not edit files outside the listed scope.
Do not edit audit reports or other build plans.
Before deleting any file, prove it has no imports/usages.
Preserve public route/API behavior unless the plan explicitly changes it.

After edits, run:
- npm run lint
- npm run build

Return:
1. files changed
2. behavior changed
3. validation run
4. risks remaining
5. follow-up tasks
```

## Merge Policy

Merge each wave only after:

- lint passes
- build passes
- targeted smoke checks pass
- no unrelated files were changed
- any deletion has import-search evidence

If two agents touch the same file, stop and serialize those plans instead of merging both blindly.
