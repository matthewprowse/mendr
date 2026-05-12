# Wave 3b — AI Timeouts, Quotas, And External Calls

## Progress
**Status:** ✅ Complete (6/7 implemented; atomic quota blocked on DB migration — see note below)  
**Tasks:** 6 / 7 complete

---

## Goal
Add `maxDuration`, atomic quota, and explicit timeouts to AI and external API calls.

## Scope
- `app/src/app/api/diagnose/route.ts`
- `app/src/lib/parts-prices/lookup.ts`
- `app/src/lib/parts-prices/extract-price.ts`
- `app/src/lib/market-rates/brave-web-search.ts`
- `app/src/app/api/cron/retry-enrichment/route.ts`

**Do NOT edit:** diagnosis parser, UI components, admin auth, provider search handler.

## Tasks
- [x] Add `export const maxDuration = 60` to `/api/diagnose/route.ts`
- [ ] Make diagnosis quota increment atomic — **blocked: requires DB migration** (see note below)
- [x] Add `AbortSignal.timeout(8_000)` to Brave search fetch in `brave-web-search.ts` — with typed `TimeoutError` catch returning `brave_search_timeout`
- [x] Add 15s `Promise.race` timeout to Gemini extraction calls in `extract-price.ts` — SDK doesn't expose AbortSignal so `Promise.race` used instead
- [x] Cap parts lookup concurrency to 3 in `lookup.ts` — manual batching loop, no new dependency
- [x] Add `export const maxDuration = 60` to `retry-enrichment/route.ts`

## Atomic Quota Migration Plan

The current quota logic in `diagnose/route.ts` reads `count` then writes `count + 1` in two separate round trips. Two simultaneous first-message requests can both read `count = 0` and both write `count = 1`, consuming two quota slots for the price of one.

**Fix requires a Supabase RPC:**

```sql
-- Migration: supabase/migrations/YYYYMMDD_atomic_quota_increment.sql
CREATE OR REPLACE FUNCTION increment_diagnosis_quota(
    p_user_id      uuid,
    p_anon_key     text,
    p_date         date,
    p_limit        int
) RETURNS TABLE(current_count int, exceeded boolean)
LANGUAGE plpgsql
AS $$
DECLARE
    v_count int;
BEGIN
    INSERT INTO diagnosis_usage (user_id, anonymous_key, date, count)
    VALUES (p_user_id, p_anon_key, p_date, 1)
    ON CONFLICT (
        COALESCE(user_id::text, ''), COALESCE(anonymous_key, ''), date
    )
    DO UPDATE SET count = diagnosis_usage.count + 1
    RETURNING diagnosis_usage.count INTO v_count;

    RETURN QUERY SELECT v_count, v_count > p_limit;
END;
$$;
```

**After migration:** replace the SELECT + fire-and-forget upsert block in `diagnose/route.ts` with a single `admin.rpc('increment_diagnosis_quota', {...})` call. If `exceeded` is true, return 429 before starting AI agents.

## Safety Constraints
- Do NOT change diagnosis response format
- Do NOT refactor diagnosis parser
- If atomic quota needs a DB migration, write migration plan and stop — do not guess

## Verification Checklist
- [ ] `/api/diagnose` has `maxDuration` export
- [ ] Retry enrichment cron has `maxDuration` export
- [ ] Quota cannot be bypassed by two simultaneous first messages
- [ ] Brave/Gemini hung calls don't consume full route budget
- [ ] Parts route processes max 3 concurrent lookups
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
