# Specialisations Operating Standard

## Purpose

This document defines how Scandio manages provider **Specialisations** so the list stays useful, searchable, and finite.

Goals:
- Keep specialisations specific enough to be meaningful.
- Avoid an infinite or random list.
- Let providers enter plain-language terms (e.g. "I'm a plumber").
- Use AI to recommend valid specialisations from an approved subset only.

---

## Core Model

We use a **3-layer model**:

1. **Category** (broad, fixed)
2. **Specialisation** (specific, approved, searchable)
3. **Alias** (free-text or alternate names mapped to approved specialisations)

Provider-facing selections are always saved as approved **Specialisation IDs**.
Free text is never stored as the final canonical value.

---

## Hard Constraints (Non-Negotiable)

1. **Finite global list**
   - Maximum approved specialisations in system: `<= 600`.
   - Maximum per category: `<= 80`.

2. **Per-provider cap**
   - A provider can select `3-12` specialisations.

3. **Naming standard**
   - Title Case.
   - Max 4 words.
   - No trailing punctuation.
   - Must describe a homeowner job outcome, not a generic trade label.

4. **No direct free-text publishing**
   - Provider free text must map to existing specialisation(s), or be queued for review.

5. **AI is constrained**
   - AI can only recommend from the approved specialisation set in this document/data model.
   - AI cannot invent new canonical specialisations at signup time.

---

## Category Rules

Categories are fixed and required for search. Example category set:
- Plumbing
- Electrical
- Roofing
- Waterproofing
- Painting
- Carpentry
- Paving
- Solar
- Pools
- Security
- Appliances
- HVAC

Rules:
- A specialisation belongs to exactly one primary category.
- Cross-category duplicates are disallowed unless explicitly approved.
- Category names are stable and rarely changed.

---

## Specialisation Rules

A specialisation is valid only if it is:
- Specific enough to route a job type.
- Common enough to recur in homeowner demand.
- Distinct from existing approved items.

Disallowed examples:
- "Plumbing" (too broad)
- "General Repairs" (too vague)
- "Best Quality Work" (marketing phrase, not a service)

Preferred examples:
- "Burst Pipe Repair"
- "Geyser Installation"
- "DB Board Upgrades"
- "Roof Leak Repair"

---

## Alias Rules (Provider Input Flexibility)

Aliases allow provider-friendly wording while preserving canonical data.

Examples:
- Alias: "Hot Water Cylinder Repair" -> Canonical: "Geyser Repair"
- Alias: "Leak Detection" -> Canonical: "Water Leak Detection"
- Alias: "Plumber" -> Category hint: Plumbing + top recommendations

Rules:
- Aliases can be many-to-one.
- Aliases are never shown as canonical selections.
- Alias-to-canonical mapping must be reversible and auditable.

---

## Provider Signup Flow (Required)

### Step 1: Category-first search
- Provider enters a broad term (e.g. "plumber").
- System maps to one or more categories.
- UI shows category chips and recommended specialisations.

### Step 2: AI recommendations (constrained retrieval)
- AI receives:
  - Provider text input
  - Candidate categories
  - Approved specialisations in those categories only
- AI returns ranked recommendations from that approved list.
- Output format: canonical IDs only.

### Step 3: Provider selection
- Provider selects from recommendations and/or searches within category.
- Typeahead supports aliases and fuzzy matching.
- Final saved values are canonical specialisation IDs.

### Step 4: Guardrails
- If provider term does not map confidently:
  - Ask follow-up question ("Residential, commercial, or both?")
  - Show closest approved options
  - Allow "Request New Specialisation" (review queue only)

---

## Search and Matching Rules

1. **Primary retrieval**
   - Category filter + specialisation index.

2. **Secondary retrieval**
   - Alias dictionary + fuzzy normalization.

3. **Ranking**
   - Exact specialisation match > alias match > category-only match.

4. **No broad-only profiles**
   - Providers must choose at least 3 approved specialisations.
   - Category-only profiles are incomplete.

---

## AI Recommendation Policy

AI recommendations must:
- Use only approved specialisations.
- Prefer high-frequency homeowner jobs.
- Avoid semantic duplicates in one recommendation set.
- Return 5-10 suggestions per provider input query.

AI recommendations must not:
- Invent new canonical labels.
- Return generic trade labels as final selections.
- Return more than 2 near-duplicate suggestions in one set.

---

## Governance and Change Management

### Review queue for new requests
Provider-requested new specialisations enter a queue with:
- Requested text
- Suggested category
- Similar existing items
- Frequency count of identical/similar requests

### Approval criteria
Add new specialisation only if all are true:
1. Not covered by existing canonical labels.
2. Expected recurring demand.
3. Distinct service outcome.
4. Fits naming standard.

### Monthly taxonomy review
- Merge duplicates.
- Retire low-usage items.
- Re-map old aliases.
- Publish change log.

---

## Data Schema (Minimum)

Tables:
- `service_categories`
  - `id`, `slug`, `label`, `active`
- `specialisations`
  - `id`, `category_id`, `label`, `slug`, `active`, `usage_count`
- `specialisation_aliases`
  - `id`, `specialisation_id`, `alias_text`, `normalized_alias`
- `provider_specialisations`
  - `provider_id`, `specialisation_id`, `source` (`ai` | `manual`)
- `specialisation_requests`
  - `id`, `provider_id`, `requested_text`, `status`, `review_notes`

---

## Quality Metrics

Track weekly:
- % provider entries mapped to canonical specialisations on first pass.
- % of AI recommendations accepted by providers.
- Duplicate collision rate (near-synonym collisions).
- New specialisation request volume.
- Category coverage balance.

Targets:
- First-pass mapping >= 90%
- Recommendation acceptance >= 60%
- Duplicate collision < 3%

---

## Practical Example

Input: "I'm a plumber"

System behavior:
1. Map input to category `Plumbing`.
2. Retrieve approved Plumbing specialisations.
3. AI ranks top 8 recommendations (canonical only), e.g.:
   - Burst Pipe Repair
   - Geyser Installation
   - Geyser Repair
   - Drain Unblocking
   - Water Leak Detection
   - Toilet Repair
   - Tap Replacement
   - Pressure Pump Installation
4. Provider selects 3-12.
5. Save canonical IDs to `provider_specialisations`.

---

## Summary Policy Statement

Scandio specialisations are a controlled vocabulary, not open-ended tags.  
Providers can describe themselves freely, but final selections must map to approved canonical specialisations via category-aware search and constrained AI recommendations.
