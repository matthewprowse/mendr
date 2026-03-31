# Scandio — expected vendor costs (welcome → diagnose → match)

This note maps each step of the homeowner flow to **paid third-party usage** in the current codebase. **All Google list prices below are converted to South African rand (ZAR)** using a fixed **USD → ZAR rate of R 17,10 per US$1** (approximate wholesale rate for **late March 2026**; refresh this rate when you update the document).

Google bills in **USD** on your card or Cloud account; your bank applies its own rate and fees. VAT or other taxes may apply on top. **Monthly free tiers and volume discounts** on Google Maps Platform and Gemini are **not** deducted in the worked examples—your real invoice can be lower.

- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing) (Places, Geocoding, Dynamic Maps)
- [Gemini API pricing](https://ai.google.dev/pricing) (model: `gemini-2.5-flash` in `src/lib/ai-client.ts`)

**Conversion used in this file:** `ZAR_amount = USD_list_price × 17,10`

---

## 1. Welcome (`/welcome`)

| Action | Paid APIs | Notes |
|--------|-----------|--------|
| User picks a photo | None | Preview is local (`FileReader` / data URL). |
| **Continue** | **Supabase Storage + DB** | `POST /api/upload-image` writes the file to the public `gallery` bucket and upserts `conversations` (`image_url`, optional `initial_image_description`). |

**Expectation:** No Gemini or Google Maps charges on the welcome step itself. You pay **Supabase** for storage, bandwidth, and tiny database IO (see your Supabase plan—typically a few rand per month at low volume unless you exceed included quotas).

---

## 2. Diagnose (`/diagnosis/...` and `/api/diagnose`)

| Action | Paid APIs | Notes |
|--------|-----------|--------|
| Load page / show image | Supabase (storage egress) if the image is served from `image_url` | The server may **re-fetch** that URL when calling Gemini so the image is sent as inline bytes. |
| Run diagnosis | **Gemini (`gemini-2.5-flash`)** | One streaming `generateContentStream` call per request; includes the **photo** (and optional `initial_image_description` / `serviceCatalog` / follow-up history). |
| Extra chat turns (if used) | **Gemini** again | Each follow-up that hits `/api/diagnose` is another billable model call (text and/or additional images). |

### 2.1 Gemini list pricing in ZAR (from Google AI, Flash model)

Public list rates (check [Gemini pricing](https://ai.google.dev/pricing) for your exact tier):

| Component | USD (list) | ZAR equivalent @ R 17,10 / USD |
|-----------|------------|---------------------------------|
| Input | US$0,30 per 1M tokens | **≈ R 5,13 per 1M input tokens** |
| Output | US$2,50 per 1M tokens | **≈ R 42,75 per 1M output tokens** |

Images are billed as input tokens (multimodal); long prompts and the service catalogue add text input tokens.

### 2.2 Per-diagnosis range (Gemini only, one successful call)

Illustrative token bundles converted at the table above (before free tier):

| Scenario | Rough tokens (input / output) | Gemini only (ZAR) |
|--------|--------------------------------|---------------------|
| **Low** | ~1 500 input + ~400 output | **≈ R 0,03** |
| **Mid** | ~5 000 input + ~1 000 output | **≈ R 0,07** |
| **High** | ~12 000 input + ~2 000 output | **≈ R 0,15** |

Use **≈ R 0,07** as a **planning midpoint** for one typical first-pass image diagnosis until you have usage data from Google AI billing.

**Supabase** on top: usually negligible per report (storage + egress for one image).

There is **no Google Places** spend on the diagnosis page unless you separately trigger location flows elsewhere.

---

## 3. Match (`/match/...`)

### 3.1 Provider list — `POST /api/providers`

This is the main variable cost for “per match.”

**Search cache (`provider_search_cache` in Supabase)**

- Key includes rounded lat/lng, normalized trade, **trade detail** string used for search, and radius (`buildSearchCacheKey` + `SEARCH_CACHE_TTL_MS` = **7 days**).
- **Cache hit (fresh row, rich cached `providers` JSON, and Google reviews already present in `reviews`):**  
  **No** `places:searchText` call. Providers are served from Supabase JSON, re-ranked in-process, internal IDs merged from `providers`. This is the **cheap path**.
- **Cache miss, expired row, thin cached payload, or no Google reviews in DB for those places:** The route calls Google **`places:searchText`** (Places API **Text Search Pro** class for the field mask in use) and may fetch **up to 2 extra pages** (`TEXT_SEARCH_MAX_EXTRA_PAGES`) if results are thin.

| Scenario           | Google Places Text Search                                | Google Place Details (GET)                                                                                                                                                 |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warm cache**     | **0**                                                    | **0** (unless some other code path refreshes reviews)                                                                                                                      |
| **Cold / refresh** | **1–3** requests (first page + up to 2 pagination calls) | **Up to one GET per persisted provider** in the batch when reviews are missing or **stale** (`reviews_synced_at` older than **7 days**), via `fetchPlaceReviewsFromGoogle` |

**After a Text Search**, candidate rows are upserted into `providers`. The handler loops Google place IDs and may call **Place Details**–style GETs to pull full review text when search results lack usable bodies or data is stale.

### 3.2 Google Maps Platform list prices in ZAR (first paid tranche, global list)

From [Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing), **per 1 000 billable events** after the advertised free caps (SKU names as on Google’s sheet):

| SKU | USD / 1 000 (list, tier 1) | ZAR / 1 000 |
|-----|----------------------------|-------------|
| **Places API Text Search Pro** | US$32 | **≈ R 547** |
| **Geocoding** | US$5 | **≈ R 85,50** |
| **Dynamic Maps** | US$7 | **≈ R 119,70** |
| **Places API Place Details Pro** (if your review/detail mask bills as Pro) | US$17 | **≈ R 290,70** |
| **Places API Place Details Essentials** (if your mask bills lower) | US$5 | **≈ R 85,50** |

**Per-request examples (list price only, zero free credit):**

- One **Text Search Pro** request: US$0,032 → **≈ R 0,55** each.  
  A cold flow with **3** paginated searches → **≈ R 1,65** in Text Search alone.
- One **Geocode** request: **≈ R 0,086** each.
- One **Dynamic Maps** load: **≈ R 0,12** each (typical: one load per match page visit).
- One **Place Details Pro** request: **≈ R 0,29** each; **Essentials** class → **≈ R 0,086** each.

A **worst-case first-time** cold match (no cache) might be in the ballpark of **≈ R 2–5+** in Places/Geocode/Maps **before** free tier—**plus** Gemini enrichment (async), depending on how many detail calls fire and your exact billed SKUs.

**Important distinction — “cached” vs “new from Google”**

- **Not the same as “new contractor.”** Almost every provider **originates from Google Places** at least once. “Cached” means you **reuse stored search results / provider rows** in Supabase for that (location, trade, detail, radius) key, not that the business is fictional.
- **New to your database:** On a cold path, places returned by Text Search are **upserted** into `providers` (`source: 'google'`). That is **new persistence**, still backed by Google data.
- **True Google API hit:** Happens when the route actually executes **`places:searchText`** (and optional detail GETs). A warm `provider_search_cache` hit avoids those calls even though data still **describes** real businesses.

Server logs / `logAiEvent` metadata on the providers endpoint includes flags such as **`searchCacheHit`**, **`usedCacheProvidersJson`**, **`usedGoogleApi`**, and cache expiry—use those to reconcile invoices with behaviour.

### 3.3 Location — `POST /api/geocode`

When the user types an address (or you reverse-geocode coords), the app uses **Geocoding** — **≈ R 0,086 per request** at list price (see table above). Browser geolocation without address entry may avoid some calls.

### 3.4 Map on the match page — `useMatchMap`

The client loads the **Maps JavaScript API** — typically billed as **Dynamic Maps**, **≈ R 0,12 per map load** at list price after free caps.

### 3.5 Background enrichment — `POST /api/enrich/queue`

After providers render, the client **fire-and-forgets** enrichment. For each provider resolved in `providers`, `enrichProvider` runs (up to 10 concurrent jobs, 30s timeout per job). That pipeline can:

- Scrape the contractor website (no Google SKU; your own egress/time).
- Run **two Gemini calls per provider** (image batch classify + combined profile/summary) per `provider-enrichment.ts` comments.

**This cost is attached to the match session but is asynchronous.** Budget roughly **2 × (Gemini cost per call)** × providers actually enriched—often **similar order of magnitude to another R 0,05–R 0,20+ per provider** in Gemini alone at list rates, depending on inputs.

---

## 4. Summary tables

### Per homeowner “vertical slice” (order of magnitude)

| Milestone | Primary cost drivers | Typical expectation (ZAR, list) |
|-----------|---------------------|----------------------------------|
| Welcome | Supabase | Usually cents to low tens of rand / month at small scale |
| First diagnosis | Gemini + Supabase | **≈ R 0,03–R 0,15** Gemini per report (plan ≈ **R 0,07**) |
| First match (cold) | Places Text Search, Place Details, Geocode, Dynamic Maps, enrichment | **≈ R 2–5+** Maps/Places layer possible before free tier; + enrichment Gemini |
| Repeat match (warm cache, same area/trade/detail/radius, fresh reviews) | Supabase + map load + maybe Geocode | **Often under ~R 1** Google-side if no Text Search |

### What to put in a spreadsheet

1. **Diagnoses / month ×** Gemini input/output tokens per call → ZAR using §2.1.  
2. **Provider API calls / month** (instrument `providers` route: count `places:searchText` vs cache hit).  
3. **Geocode calls / month** × ≈ R 0,086.  
4. **Map loads / month** × ≈ R 0,12.  
5. **Enrichment jobs / month** (~2 Gemini calls × providers enriched).  
6. **Supabase** storage and egress.

---

## 5. Disclaimer

Pricing changes frequently. Google invoices in **USD**; bank conversion to **ZAR** will differ slightly from the **R 17,10** assumption used here. This file is a **technical map from code to SKUs**, not financial advice. For binding numbers, use **Google Cloud Billing**, **Google AI** usage, and **Supabase** billing with your actual traffic mix.

---

## 6. Diagnosis-only examples (Gemini, ZAR)

Assumptions for the tables below:

- **Only** the cost of **one `/api/diagnose` call per diagnosis** (single image, first report).
- **Mid estimate:** **R 0,07** per diagnosis (see §2.2).
- **Low / high band:** **R 0,03** and **R 0,15** per diagnosis for the same counts.
- **Excludes** welcome Supabase upload, match Places/Maps, follow-up chat turns, and enrichment.

### 6.1 You complete exactly *N* diagnoses in a calendar month

| Diagnoses in the month *N* | Gemini low (N × R 0,03) | Gemini mid (N × R 0,07) | Gemini high (N × R 0,15) | Implied average per day that month (÷30) — mid only | Implied average per week (×7÷30) — mid only |
| -------------------------- | ----------------------- | ----------------------- | ------------------------ | --------------------------------------------------- | ------------------------------------------- |
| **10**                     | R 0,30                  | **R 0,70**              | R 1,50                   | **≈ R 0,02 / day**                                  | **≈ R 0,16 / week**                         |
| **100**                    | R 3,00                  | **R 7,00**              | R 15,00                  | **≈ R 0,23 / day**                                  | **≈ R 1,63 / week**                         |
| **1 000**                  | R 30,00                 | **R 70,00**             | R 150,00                 | **≈ R 2,33 / day**                                  | **≈ R 16,33 / week**                        |

*(“Average per day” = monthly Gemini mid ÷ 30. “Average per week” = same total × 7 ÷ 30—i.e. pro rata over a 30-day month. These are **not** extra charges on top of the month total.)*

### 6.2 Sustained throughput: *D* diagnoses per day (every day)

Rolling totals at **mid** estimate (R 0,07 × diagnoses per day × days):

| Diagnoses per day *D* | Per day (ZAR) | Per 7-day week (ZAR) | Per 30-day month (ZAR) |
| --------------------- | ------------- | -------------------- | ---------------------- |
| **10**                | **R 0,70**    | **R 4,90**           | **R 21,00**            |
| **100**               | **R 7,00**    | **R 49,00**          | **R 210,00**           |
| **1 000**             | **R 70,00**   | **R 490,00**         | **R 2 100,00**         |

Low / high bands: multiply the **per day / week / month** figures by **≈ 0,43** (low) or **≈ 2,14** (high) relative to mid.

---

*Last updated: internal assumptions R 17,10 / USD and Gemini mid R 0,07 per diagnosis—revisit when FX or Google list prices change.*
