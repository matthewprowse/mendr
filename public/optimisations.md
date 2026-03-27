# Scandio — Performance & Cost Optimisations

> Written: 2026-03-26
> Scope: Provider search pipeline, enrichment pipeline, match UI. Based on a full read of the live codebase.

This document covers concrete, implementable improvements ranked by impact vs effort. Every recommendation references the exact file and line where the change belongs.

---

## Priority 1 — Quick Wins (< 1 day each, high impact)

---

### 1.1 — Remove the foreground Gemini block from `POST /api/providers`

**File:** `src/app/api/providers/providers-route.ts` lines 966–1034
**Impact:** ~10–36 seconds removed from the hot path. This is the single biggest latency driver.

The `summarizeReviews` worker loop runs at concurrency 2 with a 12 s per-call timeout across up to 6 providers. In the worst case that is 36 seconds of blocking Gemini work before the response returns. Every radius change, every cold cache miss, and every new search pays this cost.

The data this produces (`p.summary`, `p.summaryMeta`) is already being produced by the background enrichment pipeline (`runCombinedEnrichment` writes `review_summary` to `provider_cache`), and the match UI already reads `enrichmentCache[placeId].reviewSummary` from `/api/enrich/get`. The foreground call is fully redundant once enrichment has run.

**What to do:**
- Delete lines 966–1034 and the `summarizeReviews` import.
- In `match-client.tsx` line 467, swap `selectedProvider.summary` for `enrichmentCache[selectedProvider.placeId]?.reviewSummary ?? null`. Show the existing skeleton when null.
- Run `scripts/re-enrich-providers.ts` before deploying so `review_summary` is populated in `provider_cache` for all existing providers.

**Cost impact:** Removing ~6 Gemini calls per hot-path request saves roughly R0.006–R0.06 per search depending on review volume. Small per-request, large at scale.

---

### 1.2 — Relax `cacheHasRichFields` to stop force-refreshing from Google

**File:** `src/app/api/providers/providers-route.ts` lines 155–169
**Impact:** Eliminates unnecessary Google Places API calls on repeat searches, dramatically improving cache hit rate.

Currently the search cache is considered valid only if at least one provider has `summaryMeta.kind === 'reviews'`. This means every cached search result that was stored before Gemini summarisation completed will be treated as a cache miss and trigger a fresh Google Places API call. After removing the foreground Gemini block (1.1), this condition can never be met from the cache — every search will be a forced miss.

```ts
// CURRENT — too strict
const cacheHasRichFields = cachedProviders.some(p =>
    typeof p.summary === 'string' && p.summary.trim().length > 0
    && p?.summaryMeta?.kind === 'reviews'
);

// BETTER — just check we have providers with basic location data
const cacheHasRichFields = cachedProviders.length > 0
    && cachedProviders.some(p => typeof p.name === 'string' && p.name.trim().length > 0);
```

Summaries now live in `enrichmentCache` (loaded separately), so the providers cache no longer needs to carry them.

---

### 1.3 — Fix the double-fetch on radius change

**File:** `src/features/match/hooks/useMatchProviders.ts` line 70
**Impact:** Halves the number of `POST /api/providers` calls on radius changes. Eliminates race conditions where a stale response overwrites a newer one.

Two bugs in one line:

```ts
// CURRENT — two bugs
[providers.length, resolveTradeContext, searchRadiusMeters]
```

1. `providers.length` — re-creates the callback every time a result arrives, not just when the inputs change. Causes the mount-load `useEffect` in `match-client.tsx` (line 254) to fire again after every successful fetch.
2. `searchRadiusMeters` as a dep — when radius changes, the callback identity changes, which cascades to `fetchProviders` changing identity, which triggers the "mount" effect again — in addition to the dedicated radius effect on line 264. Net result: two fetches per radius click.

**What to do:**
- Move `searchRadiusMeters` into a `useRef` inside the hook, update it on every render, and remove it from `useCallback` deps.
- Remove `providers.length` from deps entirely — use a ref if you need to read the current count inside the callback.
- Add an `AbortController` pattern: store the controller in a ref, abort it when a new request starts, pass `signal` to `fetchProvidersApi`. Only apply `setProviders` if the signal is not aborted.
- Add a 300 ms debounce before the fetch fires on radius change — rapid badge clicks then send at most one request per settled radius.

**Note:** Aborting the client-side fetch does not cancel server processing. The debounce is what prevents the server from doing redundant work.

---

### 1.4 — Write Gemini output back into the search cache

**File:** `src/app/api/providers/providers-route.ts` — search cache write path
**Impact:** Prevents re-running expensive per-provider work on every request to the same (lat, lng, trade, radius) within the 7-day TTL.

Currently the route writes `place_ids`, `routing_summaries`, and `providers` to `provider_search_cache`. But the `providers` JSON written there does not include the Gemini-generated summaries that are added later in the same request (lines 1021–1023). So the next request to the same cache key re-runs Gemini for the same providers.

After completing 1.1 (removing foreground Gemini), this becomes less critical. But it's still worth writing the full enriched provider objects (including anything pulled from `provider_cache`) back to the search cache so subsequent cache hits return complete data without DB round-trips.

---

### 1.5 — Parallelise website scrape + review fetch in `enrichProvider`

**File:** `src/lib/provider-enrichment.ts`
**Impact:** Cuts ~2–5 s from enrichment latency. Stage 1 (scraping, 10 s timeout) and Stage 3 (DB review fetch) are completely independent but run sequentially.

```ts
// CURRENT — sequential
const websiteText = await scrapeWebsite(url);   // up to 10 s
const reviews = await fetchReviews(providerId); // ~200 ms

// BETTER — parallel
const [websiteText, reviews] = await Promise.all([
    scrapeWebsite(url),
    fetchReviews(providerId),
]);
```

Stage 2 (image classification) depends on the scrape output, so it stays sequential after Stage 1 completes. Stage 3 can run concurrently with Stages 1–2 entirely.

---

## Priority 2 — Medium Effort (1–3 days each, significant impact)

---

### 2.1 — Parallelise per-provider DB lookups in the providers route

**File:** `src/app/api/providers/providers-route.ts` — provider_cache fetch block (~line 693)
**Impact:** Reduces DB round-trips from N serial queries to 1 bulk query.

The route fetches `provider_cache` rows one at a time per provider in some paths. These can be batched:

```ts
// Fetch all provider_cache rows for the current result set in one query
const { data: cacheRows } = await supabase
    .from('provider_cache')
    .select('...')
    .in('provider_id', allProviderIds);

const cacheByProviderId = new Map(cacheRows.map(r => [r.provider_id, r]));
```

Similarly, the `reviews` fetch for summarisation context should be batched across all providers rather than per-provider inside a worker.

---

### 2.2 — Reduce Google Places API field mask

**File:** `src/app/api/providers/providers-route.ts` lines 451 and 507
**Impact:** Direct cost reduction on Google Places API bills. You are currently billed per field category requested.

The field mask currently requests `places.reviews` (a Pro SKU field) for every search result. Reviews are then fetched from your own DB anyway (via the `reviews` table). If your DB has the reviews, you can remove `places.reviews` from the field mask and save the Google billing uplift.

Check your Google Cloud Console → Places API → SKU breakdown to see what `places.reviews` is costing per month. On a live app this is typically the most expensive Places line item.

```ts
// Consider removing from the field mask:
// places.reviews         → fetch from your own DB instead
// places.editorialSummary → only useful as a fallback when enrichment hasn't run
```

---

### 2.3 — Tune `maxOutputTokens` for enrichment to match actual output size

**File:** `src/lib/provider-enrichment.ts` line with `maxOutputTokens: 8192`
**Impact:** Potentially 2–4× reduction in Gemini output token billing for enrichment.

`maxOutputTokens` is a ceiling, not a target — you are billed for tokens actually generated. However, setting it to 8192 does signal to the model that long outputs are acceptable, which can cause it to be more verbose than needed. The actual enrichment output for a typical South African trade business is ~600–900 output tokens.

Test with `maxOutputTokens: 1500` on 20 providers to see if any are truncated. If not, lower it further. A tighter ceiling also reduces worst-case latency since the model stops generating sooner.

Similarly for the image batch classification in `classifyImagesBatch`: `maxOutputTokens: 80` is already tight. Good.

---

### 2.4 — Compress the enrichment prompt

**File:** `src/lib/provider-enrichment.ts` — `runCombinedEnrichment` prompt
**Impact:** ~200–400 input tokens saved per enrichment call. At scale this is meaningful.

The current prompt has extensive inline field-by-field instructions. A lot of this is redundant once you trust the model. Consider replacing the per-field prose explanations with a single concise instruction block and letting the JSON schema do the work:

```
Extract all available facts. Be specific. British English.
years_in_business: integer from founding year or stated experience, else null.
founder_or_key_person: owner/founder name if mentioned, else null.
highlights: 3-5 concrete differentiators extracted from content.
honest_note: one useful caveat for a homeowner, else null.
[short schema with field names and types only]
```

Shorter input → faster response → lower cost. The aggressive extraction quality is set by the overall instruction, not by repeating it for every field.

---

### 2.5 — Add a `review_summary` freshness check before running enrichment

**File:** `src/lib/provider-enrichment.ts` — cache staleness check (~line 334)
**Impact:** Avoid re-running a full 20 s enrichment cycle when only the review summary is stale.

Currently the cache is either fully fresh (skip) or fully stale (re-run everything: scrape + image classify + AI). A middle state would be useful:

```
scrape_status = ok
enriched_at = recent (< 14 days)
reviews_synced_at = stale (> 7 days) — new reviews may have arrived
```

In this state, skip the scrape and image classification, fetch only the updated reviews, and re-run only the review summary portion of the combined prompt. This produces a faster, cheaper refresh cycle for providers whose website hasn't changed but who have received new Google reviews.

---

### 2.6 — Move the `provider_search_cache` write fully off the critical path

**File:** `src/app/api/providers/providers-route.ts` — cache write block
**Impact:** Shaves 100–300 ms off responses that trigger a cache write.

Currently the search cache upsert is awaited before the response returns (or, in some paths, it's in a `void` background call). Verify every write is truly fire-and-forget: wrapped in `void` (not `await`) with its own error handling. Any awaited DB write in the response path adds latency for the common case.

---

## Priority 3 — Architectural (plan carefully, multi-day)

---

### 3.1 — Stale-while-revalidate for provider results

**Current behaviour:** When the search cache is expired (>7 days), the user waits for a full Google Places API round-trip before seeing results.

**Better behaviour:** Serve the stale cached providers immediately (with a visual "Refreshing…" indicator), trigger a background re-fetch, then swap the provider list when the fresh results arrive. Users see something useful in under 200 ms even on cache misses.

This requires a small change to the cache read logic: serve stale data with an `isStale: true` flag in the response, and have the UI trigger a background refresh request.

---

### 3.2 — Google Gemini Prompt Caching

The enrichment prompt preamble (the "You are Scandio's provider enrichment engine…" section and the field schema definition) is identical across every enrichment call. Google's Gemini API supports [explicit prompt caching](https://ai.google.dev/gemini-api/docs/caching) for inputs > 32,768 tokens. The enrichment prompt is under that threshold today, but if you add few-shot examples for the BCIS research paper (P2/P3/P5 variants), those prompts will likely qualify.

For the image classification batch call, if you standardise on the same system instruction across all classification calls, it can be cached once and reused across the day — a meaningful saving at volume.

---

### 3.3 — Replace `globalAny.__scandioProvidersFetchThrottle` with React Query

**File:** `src/features/match/hooks/useMatchProviders.ts` lines 27–39
**Impact:** Removes fragile global state, gets proper request deduplication, cache invalidation, background refetch, and stale-while-revalidate for free.

The current throttle is a global object mutated directly. It works but it's a footgun: it leaks across test runs, can't be invalidated on logout, and doesn't handle stale data revalidation. React Query (`@tanstack/react-query`) is a natural fit for the provider fetch — it handles all of this idiomatically and the codebase doesn't appear to have a conflicting data-fetching library.

This is a larger refactor but the pattern is straightforward: wrap `fetchProvidersApi` in a `useQuery` keyed on `[trade, tradeDetail, lat, lng, radius]`. React Query handles deduplication, retries, background updates, and the stale-while-revalidate pattern from 3.1 automatically.

---

### 3.4 — Streaming provider results

**Current behaviour:** The UI blocks until all ranked providers are assembled, enrichment data attached, and the response serialised.

**Better behaviour:** Stream providers as they are ranked. The first 2–3 providers appear in the UI while the rest are still being ranked and enriched.

This requires changing `POST /api/providers` to return a streaming `ReadableStream` (supported natively in Next.js App Router with `Response` streaming). The UI reads the stream and updates the provider list incrementally. High effort but the user-perceived latency improvement is substantial — especially on cache misses.

---

## Cost Breakdown (Gemini)

| Call site | Current tokens (est.) | Frequency | Savings from these changes |
|---|---|---|---|
| `summarizeReviews` × 6 in providers-route.ts | ~300 in + ~80 out per provider | Every non-cached search | **Eliminated by 1.1** |
| `classifyImagesBatch` in enrichment | ~200 in + ~20 out | Once per provider per 14 days | Already batched (R2) |
| `runCombinedEnrichment` in enrichment | ~1500 in + ~800 out | Once per provider per 14 days | Reducible by 2.3, 2.4 |

Current worst-case cost per search (non-cached, 6 providers): 6 × `summarizeReviews` = ~2,280 input + ~480 output tokens. Removing this (1.1) drops per-search Gemini cost to zero for most requests. Enrichment cost only runs once per provider per 14 days regardless of search volume.

---

## Verification Checklist

After implementing each change, verify with the Network tab:

| Change | How to verify |
|---|---|
| 1.1 foreground Gemini removed | `POST /api/providers` completes in < 3 s on cache miss |
| 1.2 cache check relaxed | Second search to same location shows cache hit in server logs; no Google Places API call |
| 1.3 double-fetch fixed | One `POST /api/providers` per radius click in DevTools Network (older requests shown as cancelled) |
| 1.5 parallel scrape+reviews | `[enrichment:X] Stage 3` log appears before `Stage 1` completes in server logs |
| 2.2 field mask reduced | Google Cloud Console → Places API SKU shows reduced `Basic Data` or `Pro Data` units |
| 2.3 token ceiling lowered | No enrichment outputs truncated (check logs for parse failures) |
