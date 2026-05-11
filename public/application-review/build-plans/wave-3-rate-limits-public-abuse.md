# Wave 3 Build Plan: Rate Limits And Public Abuse Surfaces

## Goal

Move high-risk public routes behind appropriate rate limits and prepare production-safe rate limiting without changing route behavior broadly.

## Source Reports

- `../core-api-runtime/rate-limit-abuse-caching-audit.md`
- `../core-api-runtime/api-contract-correctness-audit.md`

## Scope

Files this agent may edit:

- `app/src/lib/rate-limit.ts`
- `app/src/lib/rate-limit-config.ts`
- `app/src/app/api/events/route.ts`
- `app/src/app/api/providers/apply/route.ts`
- `app/src/app/api/parts-prices/route.ts`
- `app/src/app/api/convert-heic/route.ts`
- `app/src/app/api/contact/route.ts`
- `app/src/app/api/waitlist/route.ts`
- Provider application upload routes if in scope:
  - `app/src/app/api/providers/application-document/route.ts`
  - `app/src/app/api/providers/application-images/route.ts`
  - `app/src/app/api/providers/application-registration-cert/route.ts`

Files this agent must not edit:

- Admin auth files
- Diagnosis AI route except through `parts-prices`
- Provider search handler internals

## Tasks

- [ ] Add route buckets for `analyticsEvents`, `providerApply`, `partsPrices`, `heicConvert`, `contactForm`, and `contractorWaitlist`.
- [ ] Apply buckets to the corresponding public routes.
- [ ] Split `contact` and `waitlist` away from the `reviews` bucket.
- [ ] Decide whether this wave only adds missing buckets or also introduces Redis-backed production counters.
- [ ] If adding Redis counters, keep the existing in-memory implementation as local/dev fallback.
- [ ] Add production guardrails around `DISABLE_RATE_LIMIT` and bypass IPs.

## Safety Constraints

- Do not break existing route response shapes unless required for 429 handling.
- Keep limits conservative enough not to block ordinary use.
- If Redis env vars are missing, local development should still work.
- Do not add CAPTCHA or auth gating in the same PR unless explicitly scoped.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`

Targeted checks:

- Each updated route returns normal response before limit.
- Each updated route returns 429 after bucket exhaustion.
- `contact` and `waitlist` no longer use `reviews`.
- `events` route cannot be spammed indefinitely.
- If Redis is added, missing Redis envs fall back safely in development.

## Suggested Agent Prompt

Implement missing public route rate limits and bucket cleanup only. If Redis-backed limiting is too large for one PR, produce the missing buckets first and leave Redis as a separate follow-up. Do not change unrelated route behavior.
