# Wave 3 Build Plan: AI Timeouts, Quotas, And External Calls

## Goal

Reduce AI/external API reliability and cost risk by adding explicit timeouts, route durations, and atomic quota behavior.

## Source Reports

- `../diagnosis-ai-enrichment/ai-cost-latency-timeout-audit.md`
- `../diagnosis-ai-enrichment/parts-transcribe-enrichment-reliability-audit.md`

## Scope

Files this agent may edit:

- `app/src/app/api/diagnose/route.ts`
- `app/src/lib/parts-prices/lookup.ts`
- `app/src/lib/parts-prices/extract-price.ts`
- `app/src/lib/market-rates/brave-web-search.ts`
- `app/src/app/api/parts-prices/route.ts`
- `app/src/app/api/transcribe/route.ts`
- `app/src/app/api/cron/retry-enrichment/route.ts`
- `app/src/app/api/enrich/queue/route.ts`

Files this agent must not edit:

- Diagnosis parser consolidation files
- UI components
- Admin auth/session files
- Provider search handler decomposition

## Tasks

- [ ] Add explicit `maxDuration` to `/api/diagnose`.
- [ ] Make diagnosis quota increment atomic, preferably via a Supabase RPC or single SQL operation if available.
- [ ] Add timeout to remote image fetches in `diagnose/route.ts`.
- [ ] Add timeout wrapper around Brave fetch.
- [ ] Add timeout wrapper around parts-price Gemini extraction.
- [ ] Cap parts lookup concurrency at 2-3. If using a dependency such as `p-limit`, add it through the package manager.
- [ ] Add `maxDuration` to retry enrichment cron.
- [ ] Improve enrich queue result accounting (`succeeded`, `failed`, `timeouts`) if small enough for this wave.

## Safety Constraints

- Do not change diagnosis response format.
- Do not refactor the diagnosis parser in this wave.
- If atomic quota requires DB migration/RPC not present in repo, stop and produce a migration plan rather than guessing.
- Do not add unpinned dependencies manually; use the package manager if a dependency is needed.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`
- Existing diagnosis scripts if relevant:
  - `npm run test:diagnose-prompts`
  - `npm run test:llm-content-guard`

Targeted checks:

- `/api/diagnose` still returns the same wire format.
- Parts price route handles one hung Brave/Gemini call without hanging the whole route.
- Quota cannot be exceeded by parallel first messages, or a DB follow-up is clearly documented.
- Retry enrichment route has explicit runtime duration.

## Suggested Agent Prompt

Implement only timeout, quota, and duration hardening. Preserve all public response contracts. If a DB RPC/migration is required for atomic quota, write the migration plan and stop before unsafe application changes.
