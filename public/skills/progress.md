# Scandio — Implementation Progress

## Match Screen: Provider Ordering & Selection

### What changed

**`src/app/api/providers/ranking.ts`** — complete rewrite

The previous formula was a raw linear combination: `rating × 20 + reviews × 0.2 - distance × 0.3`. It had no concept of diagnosis context and consistently surfaced the same high-rated providers to every homeowner regardless of what they actually needed.

The new formula is a four-signal weighted composite:

| Signal | Weight | Formula |
|--------|--------|---------|
| Relevance | 40% | Keyword match between provider name/services and the AI-diagnosed `tradeDetail` (subcategory) or broad `trade` |
| Bayesian rating | 30% | `(n×r + 10×4.0) / (n + 10) / 5` — pulls low-review-count ratings toward the global mean of 4.0, so "5★ from 2 reviews" no longer beats "4.7★ from 84 reviews" |
| Proximity | 20% | Linear decay from 0 to 15 km. Within that band proximity breaks ties; beyond it the signal goes to zero so a specialist 20 km away is not penalised against a generalist 2 km away |
| Recency | 10% | Based on `last_matched_at` — providers shown recently are presumed active. Unknown/new providers get a neutral 0.5. Dormant (>6 months) score 0.1 |

Composite weights: **relevance first, rating second, proximity third, recency last**.

The ranking fetches 12 candidates (2× the carousel cap of 6) to give the rotation step room to work.

---

### Equal distribution — token bucket rotation

**New table: `provider_rotation_tokens`** (see `supabase/tables.sql`)

Each provider gets 5 tokens per ISO week. Every time a provider appears in a match result, 1 token is deducted. Providers at 0 tokens are moved to the back of the candidate list — not removed, just demoted — so there is always a fallback if the area has very few providers.

The mechanism is:
1. After the composite score sort, query `provider_rotation_tokens` for the current week
2. Apply a stable sort that keeps all healthy-token providers above all zero-token providers (preserving composite order within each tier)
3. Trim to 6
4. Async: upsert the updated token balances and `last_shown_at` timestamps

Token balances are never manually managed. They reset at the start of each new week automatically (a new row is created; old rows are ignored by the weekly `week_key` filter).

**`last_matched_at`** is also written back to the `providers` table on each match. This feeds the recency signal in future ranking calls, creating a lightweight self-reinforcing loop: providers who keep appearing stay "active"; providers who drop out of rotation drift toward dormant status.

---

### Carousel size

The carousel is capped at **6 providers** (previously 25). This is enforced at the ranking layer (`rankProviders` default limit = 6) and by the explicit `limitedProviders.splice(6)` after rotation is applied.

The first card is always the strongest relevance + rating match. Cards 2–6 are the composite ranking with rotation applied.

---

### trade_detail on DiagnosisData

`trade_detail` has been added to the `DiagnosisData` type in `src/app/chat/_components/types.ts`. The field captures the AI's subcategory string (e.g. `"rising damp / waterproofing"`, `"torch-on membrane"`) which is what feeds the relevance signal. The `useMatchConversationContext` hook already reads `diagnosis.trade_detail` from Supabase — the type was just missing the field.

To activate this fully, the `/api/diagnose` endpoint prompt needs to be extended to populate `trade_detail` in its JSON output alongside `trade`. That is the next step.

---

## Provider Enrichment (Background AI Scrape)

**`src/app/api/providers/providers-route.ts`** — background enrichment on first ingestion

When a provider is upserted into the database for the first time with a website but no summary content, a background call to `refreshProviderWebsiteById` is fired (non-blocking, capped at 2 per request). This:
- Fetches and strips the provider's website HTML
- Extracts about-section and past-work content
- Uploads any found images to the Supabase gallery bucket
- The extracted text then feeds the AI summary generation pipeline

The rate cap (2/request) prevents hammering external sites during busy periods. Refreshes also run on the `/pro/[id]` page view as a fallback for providers missed during ingestion.

---

## SQL Schema

**`supabase/tables.sql`** — full schema documented

All tables are now documented with `CREATE TABLE IF NOT EXISTS` statements:
- `services`, `conversations`, `providers`, `reviews`, `provider_images`
- `provider_search_cache`, `directions_cache`, `ai_logs`
- **New**: `provider_rotation_tokens`
- **New columns on providers**: `last_matched_at`, `about`, `past_work`

**`supabase/rls.sql`** — RLS policies documented

Public read is enabled on `services`, `providers`, and approved `reviews`. All write operations go through the service role. Token/cache/log tables are restricted to service role only.

---

## What's next

1. **Extend `/api/diagnose` prompt** to populate `trade_detail` in the JSON output. Right now the field exists in the type but the AI doesn't emit it yet. A one-line addition to the system prompt and JSON schema is all that's needed.

2. **Token restore on contact**: When a homeowner taps "Contact" and opens WhatsApp/phone/email, restore 1–2 tokens to the contacted provider. This rewards responsive providers and is the other half of the self-correcting loop. Requires a lightweight API call from the contact popover.

3. **Rotation weights**: The 40/30/20/10 split is a starting point. Once real job data is available (which contact events led to bookings), revisit these weights using the actual conversion signal.

4. **Provider profile enrichment quality flag**: Add a `profile_completeness` column (0–3: thin → Google only → website scraped → full AI extraction). Surface this in the match card so homeowners can distinguish between a rich profile and a raw Google listing. Also use it as a tie-breaking signal in ranking.

---

## Implementation Plan (Remaining Work)

### 1) Diagnose emits `trade_detail`

**Code changes**
- Update `src/app/api/diagnose/route.ts` system prompt to require both:
  - `trade` (broad category, e.g. `"roofing"`)
  - `trade_detail` (specific scope, e.g. `"leaking valley / flashing repair"`)
- Extend the output schema validator so requests fail closed if `trade` is present but `trade_detail` is missing.
- Keep a safe fallback: if the model still omits `trade_detail`, set it to the same value as `trade` and log an AI warning in `ai_logs`.

**Acceptance criteria**
- New diagnoses store both fields.
- Existing flows do not break when `trade_detail` is absent in older rows.
- Ranking uses `trade_detail` first and cleanly falls back to `trade`.

---

### 2) Token restore on contact intent

**Goal**
Reward providers that receive genuine user intent (tap to call/email/WhatsApp), so rotation is not purely punitive.

**Code changes**
- Add endpoint: `src/app/api/providers/restore-token/route.ts`
  - Input: `providerId`, `conversationId`, `channel` (`phone` | `email` | `whatsapp`)
  - Behaviour: increment weekly token balance by +1 (cap at weekly max, currently 5)
  - Upsert row if missing for the current `week_key`
- Trigger this endpoint from the contact popover in match UI when external contact actions are clicked.
- Add basic duplicate suppression (same provider + conversation + channel within a short window).

**Acceptance criteria**
- Contact taps restore tokens reliably.
- Token count never exceeds weekly cap.
- Duplicate rapid taps do not inflate tokens.

---

### 3) Rotation model tuning (from real outcomes)

**Data collection first**
- Log ranking decision payloads (top candidates, component scores, final order, selected provider interactions).
- Log contact outcomes and, later, booking-confirmed outcomes.

**Iteration path**
1. Keep current 40/30/20/10 baseline.
2. Measure:
   - Contact-through rate by rank position
   - Conversion by relevance bucket
   - Starvation rate (providers rarely shown)
3. Adjust weights in small increments (5% steps), one variable at a time.

**Acceptance criteria**
- Weight changes are backed by observed conversion trends.
- No significant regression in homeowner contact-through.
- Exposure remains distributed across active providers.

---

### 4) `profile_completeness` signal

**Schema**
- Add `providers.profile_completeness smallint not null default 0`.
- Value mapping:
  - `0`: bare listing
  - `1`: Google metadata only
  - `2`: website scraped (about/past_work present)
  - `3`: full AI-enriched profile (summary + structured strengths)

**Application**
- Compute/update level in enrichment pipeline (`src/lib/provider-enrichment.ts`).
- Show a compact badge in match cards (e.g. `Profile: Basic / Detailed / Verified`).
- Use as a tie-breaker after composite score (not a major primary weight).

**Acceptance criteria**
- Completeness values are deterministic and auditable.
- Badge is visible and understandable in the carousel.
- Tie-breaking improves profile quality without hiding strong low-data providers.

---

## Suggested Delivery Order

1. Diagnose `trade_detail` emission (unblocks relevance quality immediately)
2. Contact token restore endpoint + UI trigger (completes fairness loop)
3. `profile_completeness` schema + enrichment + card badge
4. Rotation/weight tuning once enough interaction data is available

---

## Validation Checklist for This Phase

- `npm run lint`
- `npm run build` (after schema/type changes)
- Manual flow test:
  - Diagnose a job and confirm `trade_detail` persists
  - Open match carousel and verify ordering + cap of 6
  - Tap contact methods and confirm weekly token restoration
  - Confirm no duplicate restores from rapid repeated taps
- DB checks:
  - Weekly token rows rotate by `week_key`
  - `last_matched_at` updates on ranking responses
  - `profile_completeness` reflects enrichment state
