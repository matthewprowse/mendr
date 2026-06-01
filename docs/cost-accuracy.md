# Cost Accuracy — Tracking, Reconciliation, and Drift Response

## Why this exists

Every Gemini call we make is priced and logged. The founder needs to be
confident that what we report internally matches what Google actually bills
us at month-end. This doc explains the cost-tracking chain, where drift comes
from, and the playbook for keeping the two numbers aligned.

## The tracking chain

```
Gemini API
  └─> response.usageMetadata (promptTokenCount, candidatesTokenCount,
                              cachedContentTokenCount, totalTokenCount)
        └─> logGeminiUsage()  (src/lib/ai/ai-cost-logger.ts)
              └─> estimateUsdWithTable(pricing, …)
                    └─> ai_cost_events row inserted with estimated_usd
                          ↑
                          └── pricing loaded from ai_model_pricing table
                              (cached in-process for 5 minutes, fallback
                              to FALLBACK_PRICING constant on DB failure)
```

`logGeminiUsage` is called fire-and-forget after every agent call
(`agent-classify`, `agent-prose`, `agent-reasoning`, `agent-critique`). The
function signature is intentionally compatible with `void logGeminiUsage(...)`
so a logging failure never blocks the request.

Pricing rows live in `public.ai_model_pricing`. The active rate for a model
is the row where `effective_until IS NULL`. When a price changes, the old
row is closed out (`effective_until = now()`) and a new row inserted — so
the history is queryable.

## Where drift can happen

| Source of drift                          | Detectable? | Mitigation                                                          |
|------------------------------------------|-------------|---------------------------------------------------------------------|
| Google changes pricing mid-month         | Yes         | Update `ai_model_pricing` the day of the announcement               |
| Image tokenisation differences           | Partially   | Compare invoice line items against model_name breakdown             |
| Untracked Gemini calls (one-off probes)  | Hard        | Audit anything that bypasses `logGeminiUsage`                       |
| Free-tier credits / promo discounts      | Yes         | Note them in the reconciliation report; adjust mental baseline      |
| FALLBACK_PRICING used during DB outage   | Yes         | Look for `event=pricing_db_unavailable_using_fallback` warnings     |
| Floating-point rounding                  | Yes         | Expected <1% — well below the 5% drift threshold                    |

## Updating pricing when Google changes a rate

Two paths. Either works; use whichever is faster for you.

### Via the admin endpoint (preferred)

```bash
curl -X POST https://app.menda.co.za/api/admin/ai-pricing \
  -H 'Content-Type: application/json' \
  -b admin_session=… \
  -d '{
    "model_name": "gemini-3.5-flash",
    "input_per_1m_usd": 1.75,
    "output_per_1m_usd": 9.50,
    "cached_input_per_1m_usd": 0.175,
    "source": "google-pricing-page",
    "notes": "Q3 2026 price increase per Google blog 2026-07-15"
  }'
```

The endpoint closes out the existing active row, inserts a new active row,
and invalidates the in-process pricing cache so the new rate takes effect on
the next cost-log call.

### Via direct SQL (operations / migrations)

```sql
-- Close out the active row
UPDATE public.ai_model_pricing
   SET effective_until = now()
 WHERE model_name = 'gemini-3.5-flash'
   AND effective_until IS NULL;

-- Insert the new active row
INSERT INTO public.ai_model_pricing
  (model_name, input_per_1m_usd, output_per_1m_usd, cached_input_per_1m_usd, source, notes)
VALUES
  ('gemini-3.5-flash', 1.75, 9.50, 0.175, 'google-pricing-page',
   'Q3 2026 price increase per Google blog 2026-07-15');
```

The 5-minute in-process cache means a SQL-only update will be picked up
within 5 minutes by every running serverless instance. The admin endpoint
shortcut clears the cache immediately on the instance that handled the POST,
but other instances still wait up to 5 minutes — acceptable for a
once-a-quarter price change.

## Running monthly reconciliation

At month-end, pull the Google Cloud invoice total for Gemini and run:

```bash
npm run cost:reconcile -- --month 2026-05 --invoice-usd 47.23
```

Output:

```
=== Cost reconciliation for 2026-05 ===
Tracked in ai_cost_events:    $44.61 (1,832 calls)
Google Cloud invoice:         $47.23  (provided)
Difference:                   -$2.62 (5.5% under-tracked)
Status:                       WARN  DRIFT > 5% — investigate

Breakdown by model:
  gemini-3.5-flash:     $38.41 (832 calls)
  gemini-2.5-flash:      $4.89 (700 calls)
  gemini-2.0-flash-lite: $1.31 (300 calls)
```

Exit code is `0` when drift is within threshold, `2` when drift exceeds 5%
(useful for cron / CI). Pass `--json` for a machine-readable report.

## Pricing history audit

```sql
SELECT
  model_name,
  input_per_1m_usd,
  output_per_1m_usd,
  cached_input_per_1m_usd,
  effective_from,
  effective_until,
  source,
  notes
FROM public.ai_model_pricing
WHERE model_name = 'gemini-3.5-flash'
ORDER BY effective_from DESC;
```

## When reconciliation shows >5% drift

1. **Check pricing history.** Did Google change a rate mid-month? If
   `ai_model_pricing` wasn't updated promptly, expect drift in proportion
   to how late the update was. Cross-reference `effective_from` against the
   invoice date range.
2. **Look at the model breakdown.** A single model accounting for almost
   all the drift suggests its rate is stale.
3. **Search recent logs for fallback warnings.** Grep for
   `pricing_db_unavailable_using_fallback`. If the DB was unreachable for a
   stretch, FALLBACK_PRICING was used — that constant may itself be stale.
4. **Audit Gemini call sites.** Anything calling `model.generateContent`
   without a matching `logGeminiUsage` is invisible. Search the repo:
   `rg "generateContent" src scripts` and confirm each call site has a
   logging follow-up.
5. **Check for free-tier credits / promotional discounts** on the Google
   bill. These reduce the invoice without affecting our estimated USD.
6. **Open a Linear issue.** If drift is unexplained after the above checks,
   it's worth tracking — could indicate a billing-model change on Google's
   side (e.g. image tokenisation, function-call overhead) that we need to
   model.
