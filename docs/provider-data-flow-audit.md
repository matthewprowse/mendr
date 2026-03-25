# Provider Data Flow Audit

This document describes how provider data is fetched, enriched, ranked, and stored in the current codebase.

## 1) How provider search works (Google Places path)

Entry point:
- `app/src/app/api/providers/route.ts`
- Re-exports `POST` from `app/src/app/api/providers/providers-route.ts`

Primary flow in `providers-route.ts`:
1. Build query text from trade input via `buildProviderQuery()` in `app/src/app/api/providers/query-builder.ts`.
2. Attempt read-through cache from `provider_search_cache` using `buildSearchCacheKey()` in `app/src/app/api/providers/cache.ts`.
3. If cache miss/expired, call Google Places Text Search:
   - `POST https://places.googleapis.com/v1/places:searchText`
   - Field mask includes id, name, address, rating, phone, website, location, types, reviews, opening hours, routing summaries.
4. Filter out irrelevant results (banned types/keywords, non-home-service signals, retail store types, too few reviews, out-of-radius entries).
5. Rank candidates via `rankProviders()` in `app/src/app/api/providers/ranking.ts`:
   - Composite scoring for relevance, rating, proximity, and recency.
   - Uses profile completeness from `provider_cache` as tie-break context.
6. Optionally summarize reviews; when review text is missing from search payload, fallback to Place Details:
   - `GET https://places.googleapis.com/v1/{placeResource}`
7. Persist server-side:
   - `providers` upsert (core provider profile)
   - `reviews` upsert (Google reviews)
   - `provider_search_cache` upsert (7-day cache)
   - `provider_rotation_tokens` upsert (weekly fairness)
   - `providers.last_matched_at` update

## 2) How website scraping/enrichment works

There are two related server-side paths:

### A) Background enrichment cache (`provider_cache`)
File: `app/src/lib/provider-enrichment.ts`

Main function: `enrichProvider(providerId, { trade? })`

Stages:
1. Load provider row from `providers`.
2. Enforce TTL/lock behavior using `provider_cache`:
   - Skip fresh success for 14 days.
   - Retry-lock failed scrape for 48 hours.
3. Fetch provider website HTML (`fetch` with `ScandioBot` user agent).
4. Extract text with `stripHtmlForEnrichment()`:
   - title, meta description, h1/h2, JSON-LD, visible body text.
5. Parse website `<img>` tags, download selected images, classify with Gemini (`classifyImage()`), store accepted images in Supabase storage `gallery`.
6. Build enrichment output with Gemini (`runAiEnrichment()`), combining website text, review snippets, and image categories.
7. Upsert `provider_cache` with:
   - scrape metadata (`scrape_status`, `scraped_at`, `raw_scrape_text`)
   - structured enrichment fields (`bio`, `specialisations`, etc.)
   - image summary and profile completeness.

### B) Direct website refresh helper
File: `app/src/lib/refresh-provider-website.ts`

Main function: `refreshProviderWebsiteById(id)`

Behavior:
1. Fetch provider website HTML.
2. Extract plain text and split into about/past-work buckets.
3. Download website images and upload to `gallery`.
4. Upsert `provider_images` rows with source=`website`.

Note: this helper currently returns extracted `about`/`past_work` data but does not persist those fields to `providers` inside this file.

## 3) How Google Place Details/profile sync works

File: `app/src/lib/refresh-provider-by-place-id.ts`

Main function: `refreshProviderByPlaceId(rawPlaceId)`

Behavior:
1. Calls Place Details endpoint:
   - `GET https://places.googleapis.com/v1/places/{id}`
2. Upserts `providers` by `google_place_id`.
3. Upserts recent Google `reviews` (24-month window, capped to latest 50).
4. Generates review summary and updates `providers.summary`.
5. Downloads Google photos and writes:
   - storage bucket `gallery`
   - `provider_images` rows with source=`google`.

## 4) How data is stored (where the schema really lives)

Schema/configuration sources:
- `app/supabase/tables.sql` (base table definitions)
- `app/supabase/rls.sql` (RLS and policies)
- `supabase/migrations/*.sql` (incremental DB changes)

Current repository state:
- `app/supabase/tables.sql` defines major provider tables.
- `app/supabase/rls.sql` defines RLS for provider/public tables and server-only cache/token/event tables.
- `supabase/migrations` currently contains only `20260324000000_provider_cache.sql`, focused on `provider_cache` and `provider_contact_events`.

Important implication:
- Runtime code expects additional columns/constraints on `reviews` and `provider_images` beyond what is currently declared in `app/supabase/tables.sql`.
- This indicates schema drift (database has likely evolved outside the checked-in base SQL files).

## 5) Practical source-of-truth guidance

For this project, do not treat only `app/supabase/tables.sql` + `app/supabase/rls.sql` as full source of truth. Use all three together:
1. Base SQL in `app/supabase`.
2. Migrations in `supabase/migrations`.
3. Runtime write paths in API/service code (they reveal required columns and constraints).
