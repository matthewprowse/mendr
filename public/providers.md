# Providers System — Deep Analysis

**Scope:** How providers are searched, filtered, ranked, stored, enriched, and surfaced to homeowners.
**Files covered:** 15+ source files across `src/app/api/`, `src/lib/`, `src/features/match/`, and `supabase/`.

---

## 1. Database Schema

### Core Tables

#### `providers`
The source-of-truth record for every contractor. Populated from Google Places on first search hit, updated in-place on enrichment.

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Internal primary key |
| `source` | text | `'google'` or `'direct'` (self-signup) |
| `google_place_id` | text | Google Place ID (e.g. `places/ChIJ...`) |
| `name` | text | Normalised display name (stripped of Pty Ltd, title-cased) |
| `address` | text | Formatted address from Google |
| `rating` | float | Google star rating (1–5) |
| `rating_count` | int | Number of Google reviews |
| `phone` / `website` | text | Contact details |
| `latitude` / `longitude` | float | Used for proximity scoring |
| `summary` | text | Short customer-facing summary (≤100 chars) |
| `summary_long` | text | Full narrative: About + Past Work (up to 12,000 chars) |
| `about` / `past_work` | text | AI-generated profile copy segments |
| `services` | jsonb | `[{short, full}]` — from Google types |
| `service_categories` | text[] | Flat list of service labels |
| `weekday_descriptions` | text[] | Operating hours from Google |
| `last_matched_at` | timestamptz | Last time this provider appeared in search results |
| `created_at` / `updated_at` | timestamptz | Audit timestamps |

#### `provider_cache`
Enrichment results stored per-provider with a 14-day TTL.

| Column | Type | Purpose |
|---|---|---|
| `provider_id` | UUID → providers | FK to provider |
| `google_place_id` | text | Duplicate for fast lookups |
| `scrape_status` | text | `'ok'`, `'failed'`, or `'skip'` (no website) |
| `scraped_at` / `enriched_at` | timestamptz | TTL anchors |
| `bio` | text | AI-generated 2–3 sentence bio (max 280 chars) |
| `specialisations` | text[] | Up to 6 service specialisations |
| `years_experience` | int | If explicitly stated on website |
| `service_areas` | text[] | Named areas the contractor serves |
| `certifications` | text[] | Credentials and accreditations |
| `response_profile` | text | 1-sentence response style (max 80 chars) |
| `website_quality` | text | `high`, `medium`, `low`, or `none` |
| `profile_completeness` | int | 0–3 scale (see below) |
| `images` | jsonb | `[{category, path}]` — stored in Supabase gallery bucket |
| `has_work_photos` | boolean | Any `work_photo` category images kept |
| `review_summary` | text | 2-sentence Gemini summary of reviews (max 100 chars) |
| `raw_scrape_text` | text | First 8,000 chars of website text (for debugging) |
| `cache_version` | int | Schema version (currently 1) |

**Profile completeness scale:**
- `0` — No website or website inaccessible
- `1` — Website scraped, no AI enrichment ran
- `2` — Enriched (bio + specialisations generated)
- `3` — Enriched AND has work photos or certifications

#### `provider_rotation_tokens`
Token-bucket system for equitable provider distribution. Prevents the same few high-scoring providers from monopolising all results.

| Column | Purpose |
|---|---|
| `provider_id` | FK to provider |
| `week_key` | ISO week string: `"2026-W12"` |
| `tokens_remaining` | 0–5 (resets to 5 each new week) |
| `last_shown_at` | Timestamp of last appearance |

Rules: Each provider starts with 5 tokens per week. One token is deducted every time the provider appears in a match result. At 0 tokens, the provider is still shown but demoted to the end of the carousel. Tokens are restored when a homeowner contacts the provider (phone/email/WhatsApp) within a 45-second deduplication window.

#### `provider_contact_events`
Prevents duplicate token restorations. Stores every contact intent with a composite dedupe key.

| Column | Purpose |
|---|---|
| `provider_id` | Who was contacted |
| `conversation_id` | Which diagnosis session |
| `channel` | `'phone'`, `'email'`, `'whatsapp'` |
| `dedupe_key` | `providerId:conversationId:channel:weekKey` |
| `created_at` | Used for 45-second window check |

#### `provider_search_cache`
7-day cache keyed on `(lat, lng, trade, tradeDetail, radius)`. Avoids redundant Google Places API calls for the same location+trade combination.

| Column | Purpose |
|---|---|
| `query_key` | Hash of search parameters |
| `place_ids` | Array of Google Place IDs from last search |
| `routing_summaries` | Google routing data |
| `providers` | Full serialised provider objects (fast-path, skips DB lookup) |
| `next_page_token` | For pagination |
| `created_at` | TTL anchor (7 days) |

#### `provider_images`
Gallery photos from Google Places or website scraping, stored in Supabase's `gallery` storage bucket.

| Column | Purpose |
|---|---|
| `source` | `'google'` or `'website'` |
| `source_ref` | Original URL or Google photo reference |
| `caption` | Alt text / label |
| `bucket` / `path` | Supabase storage location |
| `sort_order` | Display ordering |
| `status` | `'approved'` (all website images go through Gemini classification first) |

#### `reviews`
Unified table for both Google reviews (imported on search) and Scandio reviews (submitted by homeowners post-job).

| Column | Purpose |
|---|---|
| `source` | `'google'` or `'scandio'` |
| `source_ref` | Google review ID or null |
| `rating` | 1–5 star rating |
| `body` | Review text |
| `category_ratings` | jsonb: `{punctuality, cleanliness, work_quality, quote_accuracy}` — Scandio reviews only |
| `status` | `'pending'`, `'approved'`, `'rejected'` — Scandio reviews require approval |

---

## 2. The Full Provider Flow

### Phase 1 — Diagnosis
Before any provider search begins, the homeowner goes through diagnosis.

1. Homeowner uploads a photo or types a description at `/welcome`.
2. `POST /api/diagnose` sends the image to **Gemini 2.5-flash** with a structured system prompt.
3. Gemini returns a JSON diagnosis:
   ```json
   {
     "trade": "Plumbing",
     "trade_detail": "Geyser Replacement",
     "diagnosis": "Plumbing / Geyser Replacement",
     "estimated_diagnosis_sentence": "...",
     "requires_clarification": false,
     "rejected": false,
     "unserviced": false
   }
   ```
4. This is stored in the `conversations` table against the session.
5. The homeowner is redirected to `/match/[conversationId]`.

---

### Phase 2 — Provider Search (`POST /api/providers`)

The match page calls this immediately on load. Full flow:

#### Step 1: Query construction (`query-builder.ts`)
`trade` + `tradeDetail` from the diagnosis are mapped to a Google Places text search query.

```
trade: "Plumbing"
tradeDetail: "Geyser Replacement"
→ searchQuery: "Plumber Geyser Replacement"
```

Special case: if `tradeDetail` contains "borehole", "well", or "drill", the query overrides to `"Borehole drilling contractor"` regardless of trade.

The query is capped at 200 characters.

#### Step 2: Cache check (`provider_search_cache`)
Before calling Google, the system builds a cache key from `(lat, lng, tradeNorm, detailKeyForCache, radius)` and checks the `provider_search_cache` table.

- **Cache hit + rich fields**: Providers are served directly from the cached JSON. No Google API call made. No database provider lookup needed. This is the fast path.
- **Cache hit but no Google reviews**: Forces a fresh Google fetch anyway so review import can run.
- **Cache miss or expired (>7 days)**: Proceeds to Google Places API call.

#### Step 3: Google Places Text Search API
`POST https://places.googleapis.com/v1/places:searchText`

Request includes:
- `textQuery`: the constructed search query
- `locationBias.circle`: centre on homeowner's lat/lng, radius in metres
- `maxResultCount`: 20
- Field mask requesting: `id`, `displayName`, `formattedAddress`, `location`, `rating`, `userRatingCount`, `types`, `currentOpeningHours`, `regularOpeningHours`, `websiteUri`, `nationalPhoneNumber`, `routingSummaries`

If the first page returns fewer than 6 results and a `nextPageToken` exists, up to **2 extra pages** are automatically fetched to ensure enough candidates.

#### Step 4: Filtering (`isProviderRelevantForTrade`)
Each Google Places result goes through a multi-layer relevance filter before being considered for ranking:

1. **Hard block by Google type** — any result typed as `cannabis_store`, `restaurant`, `beauty_salon`, etc. is immediately rejected.
2. **Hard block by keyword** — provider name/types/address are scanned for banned keywords (`cannabis`, `restaurant`, `cocktail`, etc.).
3. **Service keyword gate** — at least one home-service keyword must be present in the combined haystack (`electric`, `plumb`, `geyser`, `roof`, `tile`, `paint`, `locksmith`, `pool`, etc.). Anything that passes the banned check but contains no service signals is dropped.
4. **Trade-specific gates** — trade-aware hard requirements:
   - `plumbing` trade → must contain `plumb` or `geyser` (unless it's a borehole specialty)
   - `borehole` detail → must contain `borehole`, `well drill`, `pump`, or `drill`
   - `electrical` → must contain `electric`
   - `locksmith` → must contain `lock`
   - `pool` → must contain `pool`
   - `painting` → must contain `paint`
   - `security & access` → alarm/CCTV/guard types are rejected unless gate/garage door types are also present
5. **Minimum review count** — fewer than **5 Google reviews** → filtered out.

#### Step 5: Provider persistence
For each filtered place, the system checks if a `providers` row already exists for that Google Place ID.

- **Exists**: loads the cached row, applies name normalisation if needed.
- **Does not exist**: inserts a new `providers` row from the Google Places data. Google reviews are fetched and inserted into the `reviews` table (up to 5 reviews per provider from the Places Detail API, with a 5-second timeout).

This happens **within the main request** — it is not deferred.

#### Step 6: Ranking (`ranking.ts`)
All filtered+persisted providers are passed to `rankProviders()` which scores each one on four dimensions:

| Signal | Weight | Formula |
|---|---|---|
| **Relevance** | 40% | Keyword match of provider name + services vs. `tradeDetail` and `trade` |
| **Bayesian rating** | 30% | `(n×r + 10×4.0) / (n+10) / 5` — smoothed star rating, normalised 0–1 |
| **Proximity** | 20% | Linear decay: 1.0 at ≤2km, 0.0 at ≥15km |
| **Recency** | 10% | 1.0 if matched in last 30 days, 0.5 if never matched, 0.1 if >6 months |

Composite score: `0.4R + 0.3B + 0.2P + 0.1Rc`

Tiebreaker: `profileCompleteness` (0–3). Enriched providers with work photos beat equally-scored unenriched providers.

The top **6** providers are returned.

#### Step 7: Cache write
After a fresh Google API call, the result is written back to `provider_search_cache` asynchronously (non-blocking). The next request for the same location+trade will hit the fast path.

#### Step 8: Response
The API returns:
```json
{
  "providers": [...6 ranked ProviderItem objects...],
  "nextPageToken": null,
  "searchQuery": "Plumber Geyser Replacement",
  "tradeDetail": "Geyser Replacement"
}
```

---

### Phase 3 — Match Page Display

The `useMatchProviders` hook on the client calls `POST /api/providers` and renders results into:

1. **Carousel** — horizontally scrollable provider cards showing name, rating, address, distance/duration (from Directions API), open/closed status, and profile completeness badge.
2. **Map** — Google Maps JS embed with a marker per provider. Clicking a marker selects the provider in the carousel.

The homeowner can adjust radius (5, 10, 20, 50 km) which triggers a new provider fetch.

---

### Phase 4 — Provider Contact & Token Restoration

When a homeowner taps a contact button (phone/email/WhatsApp):

1. The contact intent is logged via `POST /api/providers/restore-token`.
2. Deduplication check: if the same `providerId:conversationId:channel:weekKey` was seen in the last 45 seconds, the request is silently dropped.
3. Otherwise: the provider's `tokens_remaining` in `provider_rotation_tokens` is incremented by 1 (capped at 5).
4. The event is stored in `provider_contact_events` for audit and deduplication.

---

### Phase 5 — Background Enrichment

Enrichment is triggered as a **fire-and-forget** call from the client when the match page loads or a provider is selected. It does not block the UI.

**Trigger:** `POST /api/enrich/queue` with a list of Google Place IDs.

**Queue route:**
- Maps Place IDs → internal provider UUIDs via a single Supabase query.
- Runs up to **10 concurrent enrichment jobs** using an in-process semaphore.
- Each job has a **30-second timeout**. Failures are silently swallowed — they don't affect the response.
- Returns `{ queued, processed }` immediately (client doesn't wait).

**`enrichProvider()` pipeline** (`src/lib/provider-enrichment.ts`):

#### Guard: Cache freshness check
Before any work:
- `scrape_status === 'ok'` AND cache is < 14 days old → **skip** (return immediately)
- `scrape_status === 'failed'` AND cache is < 48 hours old → **skip** (retry locked)
- Otherwise: proceed

#### Stage 1 — Website scraping (10s timeout)
```
GET provider.website
User-Agent: ScandioBot/1.0 (+https://scandio.app)
```
Extracts structured text from the HTML:
- `<title>`, `<meta description>`, `<h1>` / `<h2>` headings
- JSON-LD structured data blocks
- Body text (scripts/styles/head stripped; block elements converted to newlines)
- Output capped at **12,000 characters**

Requires ≥ 100 characters of extracted content to proceed. Fails silently if the website is down, returns non-HTML, or times out.

#### Stage 2 — Image classification (up to 8 fetch × 8s + 5 classify × 8s)
From the raw HTML:
- Extracts up to **8** `<img>` src URLs
- Filters: skips `data:` URIs, SVGs, ICO files, and URLs containing `logo`/`icon`/`favicon`/`sprite`/`bg-`/`background`
- Downloads each image (minimum **5,000 bytes** to pass)
- Classifies each image with a **Gemini call** (temperature 0, max 20 tokens):
  ```
  work_photo | team_photo | equipment | premises | certificate | discard
  ```
- Keeps up to **5** classified images
- Images in KEEP_CATEGORIES are uploaded to the `gallery` Supabase storage bucket at:
  `providers/{providerId}/images/{timestamp}-{index}.{ext}`
- Written to `provider_images` table

#### Stage 3 — AI enrichment (20s timeout)
A single **Gemini** call (temperature 0.3, max 1024 tokens) with:
- Provider name and primary trade
- Website text (up to 12,000 chars)
- Image categories found
- Up to 40 review bodies (approved Google + Scandio reviews)

Returns JSON (validated and parsed from raw response):
```json
{
  "bio": "...",
  "specialisations": ["...", "..."],
  "years_experience": 12,
  "service_areas": ["Cape Town", "Stellenbosch"],
  "certifications": ["ECSA Registered"],
  "response_profile": "...",
  "website_quality": "medium"
}
```

#### Stage 4 — Review summary (15s timeout)
`summarizeReviews()` (separate Gemini call) generates a 2-sentence, ≤100-character customer-facing summary from the most recent 15 reviews.

#### Stage 5 — Profile copy generation
`generateProviderSummaries()` (another Gemini call) produces three narrative blocks:
- `customerReviewSummary` — 3–5 sentence review digest
- `aboutBusiness` — 2–3 sentence business description from website content
- `pastWork` — 2–4 sentences describing concrete completed projects

These are written to `providers.about`, `providers.past_work`, and `providers.summary_long`.

#### Stage 6 — Cache write (upsert)
All enrichment results are written to `provider_cache` in a single upsert. `provider.summary` is only overwritten if it was previously empty.

---

### Phase 6 — Provider Profile Page (`/pro/[id]`)

The pro page accepts either a UUID or a Google Place ID in the URL. It loads:
- Provider core data from `providers`
- Enrichment data from `provider_cache` (bio, specialisations, etc.)
- Reviews from `reviews` (both sources, both approved)
- Images from `provider_images`

**Tabs:**
- **About** — AI bio, address, Google Map embed, operating hours, website/phone links, long profile narrative
- **Reviews** — Scandio category ratings (punctuality, cleanliness, work quality, quote accuracy) + Google reviews + review submission form
- **Gallery** — Image grid from storage bucket, with Google photo sync

---

## 3. External Services & Cost Drivers

| Service | Used For | API Calls Per Search |
|---|---|---|
| **Google Places Text Search** | Provider discovery | 1–3 (pagination) |
| **Google Places Detail** | Review import | 1 per new provider |
| **Google Directions** | Distance/duration | 1 per provider pair (7-day cache) |
| **Google Maps JS** | Map rendering | Free tier (session-based) |
| **Gemini 2.5-flash** | Diagnosis | 1 per homeowner session |
| **Gemini 2.5-flash** | Image classification | Up to 5 per enrichment |
| **Gemini 2.5-flash** | AI enrichment | 1 per enrichment |
| **Gemini 2.5-flash** | Review summary | 1 per enrichment |
| **Gemini 2.5-flash** | Profile copy | 1 per enrichment |
| **Supabase** | DB + Storage | Multiple reads/writes per request |

A **cold search** (no cache, 6 new providers, all enriched) can trigger:
- 3× Google Places calls
- 6× Google Detail calls (reviews)
- 1× Gemini diagnosis (already done before)
- Up to 30× Gemini enrichment calls (5 image + 1 enrich + 1 review + 1 copy × 6 providers)

A **warm search** (full cache hit):
- 0 Google API calls
- 0 Gemini calls
- 1 Supabase read

---

## 4. Improvements & Recommendations

---

### R1. Enrichment runs 3–4 separate Gemini calls per provider — consolidate into 1

**Current behaviour:**
Each `enrichProvider()` call makes up to 4 sequential Gemini requests per provider:
1. Image classification (up to 5 calls — one per image)
2. AI enrichment (bio, specialisations, etc.)
3. Review summary
4. Profile copy (about, past work, customer summary)

For 6 providers being enriched concurrently, that is potentially **24–36 Gemini calls in a single user session**.

**Recommendation:**
Consolidate the `runAiEnrichment`, `summarizeReviews`, and `generateProviderSummaries` calls into a **single Gemini request** per provider. The prompt already has all the context needed. Return a unified JSON object:

```json
{
  "bio": "...",
  "specialisations": ["..."],
  "years_experience": 8,
  "service_areas": ["Cape Town"],
  "certifications": [],
  "response_profile": "...",
  "website_quality": "high",
  "review_summary": "...",
  "about_business": "...",
  "past_work": "..."
}
```

**Impact:** Reduces Gemini calls from 3–4 per provider to **1** (plus image classification). At 6 providers that drops from ~24 calls to ~11. Cuts latency, cost, and failure surface area dramatically.

---

### R2. Image classification fires one Gemini call per image — batch classify instead

**Current behaviour:**
Each image is fetched and classified in a separate Gemini call. With up to 5 images per provider, that is 5 sequential Gemini vision calls, each with an 8-second timeout = up to 40 seconds of image processing time per provider.

**Recommendation:**
Send all images in a **single multi-image Gemini call**:

```ts
// Instead of classifyImage() called in a loop, send a single request:
{
  contents: [{
    role: 'user',
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: base64_1 } },
      { inlineData: { mimeType: 'image/jpeg', data: base64_2 } },
      { inlineData: { mimeType: 'image/jpeg', data: base64_3 } },
      { text: 'Classify each image in order as exactly one of: work_photo, team_photo, equipment, premises, certificate, discard. Reply with a JSON array of strings only.' }
    ]
  }],
  generationConfig: { temperature: 0, maxOutputTokens: 80 }
}
```

Expected response: `["work_photo", "discard", "premises", "work_photo", "discard"]`

**Impact:** Reduces image classification from 5 Gemini calls to **1**. Combined with R1, enrichment per provider drops to **2 Gemini calls total** (one for images, one for everything else). This is a significant cost and latency reduction.

---

### R3. The enrichment queue runs inside the Next.js API response — it will be killed by Vercel's function timeout

**Current behaviour:**
`POST /api/enrich/queue` runs `enrichProvider()` for up to 10 providers **within the serverless function**. Each enrichment job can take up to 30 seconds. On Vercel's hobby/pro plans, the default function timeout is 10–60 seconds. If the function times out, jobs that haven't completed yet are killed mid-write, potentially leaving `provider_cache` in a partially-written state.

The client fires this as "fire-and-forget" — it does not await the response — but the server still has to complete the work.

**Recommendation:**
Move enrichment to a proper background job system. Options:

**Option A — Vercel Background Functions (simplest):**
Export the route with `export const maxDuration = 300` (up to 5 minutes on Pro). Add it as a proper background function invocation.

```ts
// src/app/api/enrich/queue/route.ts
export const maxDuration = 300; // Vercel Pro: up to 300s
```

**Option B — Inngest (recommended for scale):**
Inngest provides durable, retryable background jobs with a generous free tier. Replace the semaphore-based in-process queue with an Inngest function:

```ts
// src/inngest/functions/enrich-provider.ts
export const enrichProviderFn = inngest.createFunction(
  { id: 'enrich-provider', retries: 2 },
  { event: 'provider/enrich.requested' },
  async ({ event }) => {
    await enrichProvider(event.data.providerId, { trade: event.data.trade });
  }
);
```

The queue route becomes a simple event dispatch — returns instantly, Inngest handles execution:
```ts
await inngest.send(placeIds.map(id => ({ name: 'provider/enrich.requested', data: { providerId: id, trade } })));
return NextResponse.json({ queued: placeIds.length });
```

**Impact:** Eliminates the risk of mid-write function kills, provides retry logic on failure, gives visibility into job status, and removes the 30-second per-job timeout constraint.

---

### R4. The `provider_search_cache` fast path can serve stale rankings

**Current behaviour:**
When a cache hit occurs and the stored `providers` JSON has `summaryMeta.kind === 'reviews'`, the full provider objects are served as-is from the cache. The **ranking score** was computed when the cache was first written and is now up to 7 days old. A provider that was active 7 days ago and has since gone dormant still gets its old recency score.

**Recommendation:**
Store the **raw provider data** (without the composite score) in the cache, and **re-rank on cache hit** using the current timestamp. The ranking function is pure and fast (no I/O) — it adds <1ms.

```ts
// On cache hit:
const reRanked = rankProviders(filteredCached, 6, { tradeDetail, trade });
return NextResponse.json({ providers: reRanked, ... });
```

**Impact:** Results stay fresh even on cache hits. Dormant providers correctly get lower recency scores over time without needing a cache invalidation.

---

### R5. Relevance scoring only looks at provider name and `services` array — misses `provider_cache.specialisations`

**Current behaviour:**
`relevanceScore()` in `ranking.ts` builds its haystack from `provider.name` and `provider.services` (the short/full labels derived from Google Place types). It does not use the enrichment data — specifically `provider_cache.specialisations` — which often contains far more specific and accurate service descriptions.

For example: a provider whose Google type is `general_contractor` with services `["General Contractor"]` will get a relevance score of 0.3 for "Roofing / Waterproofing" even if their enrichment says `specialisations: ["flat roof waterproofing", "slate roof repairs"]`.

**Recommendation:**
Include `specialisations` from enrichment cache in the relevance haystack. This requires joining the cache data before ranking — the provider search already loads this data for the `profileCompleteness` field, so the data is already available:

```ts
function relevanceScore(provider: ProviderItem, tradeDetail?: string, trade?: string): number {
    const haystack = [
        (provider.name ?? '').toLowerCase(),
        ...(provider.services ?? []).flatMap(s => [s.short, s.full].map(v => (v ?? '').toLowerCase())),
        ...(provider.specialisations ?? []).map(s => s.toLowerCase()), // ← add this
    ].join(' ');
    // ... rest of function unchanged
}
```

And surface `specialisations` on `ProviderItem` from the cache join.

**Impact:** Specialists are ranked higher for matching diagnoses. A roofing waterproofing specialist beats a generic contractor when the diagnosis is "Roof / Waterproofing", even if their Google type doesn't reflect that specificity.

---

### R6. Google reviews are only imported on the first time a provider is seen — they never refresh

**Current behaviour:**
`fetchPlaceReviewsFromGoogle()` is called during provider persistence (Step 5 of Phase 2). The function is called when a new `providers` row is created. It is **not** called on subsequent requests when the provider already exists in the database.

Google reviews change over time. A provider with 40 reviews now had 38 when they were first saved. New reviews (positive or negative) never make it into the system.

**Recommendation:**
Add a staleness check on the review import. Add a `reviews_synced_at` column to `providers` and re-fetch Google reviews if the last sync is > 7 days old:

```ts
const REVIEW_SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const needsReviewSync = !provider.reviews_synced_at ||
  (Date.now() - new Date(provider.reviews_synced_at).getTime()) > REVIEW_SYNC_TTL_MS;

if (needsReviewSync) {
  // fire-and-forget: re-fetch reviews, update rating/rating_count, update reviews_synced_at
}
```

This can run asynchronously (non-blocking) — the same pattern used by the name normalisation background update already in the codebase.

**Impact:** Review counts and ratings in the database stay current, improving Bayesian score accuracy and ensuring the review summary shown on the provider profile reflects recent feedback.

---

### R7. The directions API is called per-provider per-homeowner — the cache key doesn't account for provider location precision

**Current behaviour:**
`GET /api/directions?origin=...&destination=...` caches results for 7 days using the raw origin and destination strings as a bidirectional cache key. If the homeowner's coordinates change slightly (e.g., different GPS precision on a second visit), a new Directions API call fires even though the result would be nearly identical.

**Recommendation:**
Round coordinates to **3 decimal places** (~111m precision) before building the cache key. This dramatically increases cache hit rate for users at the same address across multiple sessions:

```ts
const roundCoord = (v: number) => Math.round(v * 1000) / 1000;
const origin = `${roundCoord(originLat)},${roundCoord(originLng)}`;
const destination = `${roundCoord(destLat)},${roundCoord(destLng)}`;
const cacheKey = [origin, destination].sort().join('→');
```

**Impact:** Higher cache hit rate on the Directions API. Fewer Google API calls, lower latency for returning users.

---

### R8. `isProviderRelevantForTrade` uses an all-or-nothing SERVICE_KEYWORDS gate that can incorrectly reject valid providers

**Current behaviour:**
Any provider that doesn't contain at least one keyword from `SERVICE_KEYWORDS` is dropped, regardless of other signals. The keyword list covers the most common trades but misses some valid ones: `waterproofing`, `damp proofing`, `glazing`, `insulation`, `solar`, `irrigation`, `thatching`, `scaffolding`.

A waterproofing contractor whose Google type is `general_contractor` and whose name is "Cape Damp Solutions" would be dropped because neither `waterproofing` nor `damp` appears in `SERVICE_KEYWORDS`.

**Recommendation:**
Expand `SERVICE_KEYWORDS` to include the common missing trades, and add a fallback: if the provider's Google category is `general_contractor` or `home_goods_store` and the search query itself contains a trade term, treat it as passing:

```ts
const SERVICE_KEYWORDS = [
    'electric', 'plumb', 'geyser', 'drain', 'sewer',
    'gate', 'garage door', 'roof', 'gutter', 'tile', 'floor', 'flooring',
    'paint', 'pool', 'locksmith', 'waste', 'rubble', 'removal', 'weld',
    'carpentry', 'woodwork', 'builder', 'construction', 'contractor', 'handyman',
    'borehole', 'well', 'drill', 'pump',
    // Add:
    'waterproof', 'damp', 'glazing', 'glass', 'solar', 'irrigation',
    'insulation', 'scaffold', 'thatch', 'paving', 'concrete', 'hvac',
];
```

**Impact:** Reduces false negatives for legitimate contractors in less-common trades. Improves result coverage for diagnoses like "Roofing / Waterproofing" or "Building / Damp Proofing".

---

### R9. Profile completeness tiebreaker uses a 0–3 integer scale but `2` and `3` are indistinguishable to the ranking function

**Current behaviour:**
`computeProfileCompleteness()` returns:
- `0` — no website
- `1` — website only
- `2` — enriched (bio + specialisations)
- `3` — enriched + work photos or certifications

This is used as a tiebreaker in `rankProviders()` when composite scores are within 0.01 of each other. However, the difference between completeness 2 and 3 is not surfaced in the sort — both are just "enriched". A provider with certifications and work photos ranks the same as one with just a bio.

**Recommendation:**
Use `profileCompleteness` as a continuous fractional tiebreaker within the composite score rather than a post-sort integer comparison:

```ts
export function compositeScore(p: ProviderItem, tradeDetail?: string, trade?: string): number {
    const completenessBonus = ((p.profileCompleteness ?? 0) / 3) * 0.02; // max +0.02
    return (
        0.4 * relevanceScore(p, tradeDetail, trade) +
        0.3 * bayesianRatingScore(p.rating, p.ratingCount ?? 0) +
        0.2 * proximityScore(p.distanceKm) +
        0.1 * recencyScore((p as any).lastMatchedAt) +
        completenessBonus
    );
}
```

This gives enriched providers a small, bounded boost without overriding the primary signals. A provider with work photos and certs edges ahead of an equally-scored unenriched provider, which is the right behaviour.

**Impact:** Better providers (richer profiles) surface slightly higher in the carousel at equal competitive scores. Incentivises contractors to maintain complete profiles.

---

### R10. `TRADE_QUERY_MAP` for "security & access" maps to "Garage door repair contractor" — misses gate motor repairs

**Current behaviour:**
```ts
'security & access': 'Garage door repair contractor',
```

If the diagnosis is `Security & Access / Gate Motor Repair`, the Google search query becomes `"Garage door repair contractor Gate Motor Repair"`. This conflates garage doors and electric gates, which are distinct trades with distinct contractors. A gate motor specialist (e.g., CENTURION system technician) would not be found with a garage door search query.

**Recommendation:**
Use `tradeDetail` to differentiate the query for this trade:

```ts
// In buildProviderQuery:
if (tradeNorm === 'security & access') {
    const detail = tradeDetailNorm;
    if (detail.includes('gate') || detail.includes('motor')) {
        searchQuery = `Gate motor repair contractor ${tradeDetailRaw}`;
    } else if (detail.includes('garage')) {
        searchQuery = `Garage door repair contractor ${tradeDetailRaw}`;
    } else {
        searchQuery = `Gate and garage door contractor ${tradeDetailRaw}`;
    }
}
```

**Impact:** More accurate Google Places results for gate vs. garage door diagnoses. Reduces the chance of surfacing garage door specialists for a gate motor fault and vice versa.

---

## 5. Summary Table

| # | Area | Type | Impact | Effort |
|---|---|---|---|---|
| R1 | Enrichment — 3–4 Gemini calls per provider | Cost & Speed | High | Low |
| R2 | Image classification — 5 Gemini calls → 1 batch call | Cost & Speed | High | Low |
| R3 | Enrichment queue runs inside serverless function | Reliability | High | Medium |
| R4 | Search cache serves stale rankings | Accuracy | Medium | Low |
| R5 | Relevance scoring ignores enrichment specialisations | Accuracy | High | Low |
| R6 | Google reviews never refresh after first import | Accuracy | Medium | Low |
| R7 | Directions cache key too precise — low hit rate | Cost & Speed | Low | Low |
| R8 | SERVICE_KEYWORDS gate misses valid trade keywords | Accuracy | Medium | Low |
| R9 | Profile completeness tiebreaker is a blunt instrument | Accuracy | Low | Low |
| R10 | Security & Access query doesn't differentiate gate vs. garage | Accuracy | Medium | Low |
