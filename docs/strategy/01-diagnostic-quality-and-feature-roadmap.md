# Mendr — Diagnostic Quality & Feature Roadmap

*Last updated: 2026-05-22. Owner: Matthew Prowse.*

This document consolidates the diagnostic-quality improvement plan that was researched and partially shipped between April and May 2026, plus the original competitive analysis that informed the broader product direction.

It is the canonical reference for:

1. What was shipped in Phases 1–5 of the diagnostic-quality work
2. What competitors (international and SA) are doing
3. What's next in the roadmap by theme

For contractor-side strategy see `02-contractor-retention-and-pricing.md`. For homeowner stickiness see `03-homeowner-retention.md`.

---

## 1. Context: what Mendr is today

Mendr is an AI-powered home fault diagnosis and contractor matching platform for Western Cape homeowners. The core loop:

```
/start  →  /diagnosis  →  /processing/[id]  →  /report/[id]  →  /match
```

- Homeowner describes a problem (text + optional voice) on `/start`
- Photos uploaded on `/diagnosis` (up to 4 since Phase 2)
- Gemini 2.5 Flash runs a two-agent pipeline (classification + prose) via `/processing/[id]`
- A written report renders on `/report/[id]` with diagnosis, contractor checklist, homeowner prep, cost estimate, and DIY verification
- The user is matched with vetted contractors on `/match`

13 trade categories. Currently Western Cape only. ~500 contractors in the network. ~760 historical diagnoses.

---

## 2. Competitive position

The single defensible insight that emerged from the competitor research:

> **No competitor produces a written diagnostic report. Mendr does. That's the moat.**

Every other home-services platform — Thumbtack, Angi, HomeAdvisor, TaskRabbit, Checkatrade, Snupit, Kandua — assumes the homeowner already knows what trade they need. They are matching engines. Mendr is a diagnostic engine that *then* matches.

### International landscape (summary)

| Platform | Photo diagnosis | AI matching | Vetting | Notable weakness |
|---|---|---|---|---|
| Thumbtack | In beta, rolling out 2026 | Yes (Helper) | Moderate | Ghost-lead lawsuits |
| Angi / HomeAdvisor | No | AI Helper 2025 | Background check | FTC enforcement 2023, contractor trust collapse |
| TaskRabbit | No | Partial | Background check | Scope limited to discrete tasks |
| Checkatrade | No | No | Industry-leading | Pre-AI directory |
| MyBuilder / Rated People | No | No | Variable | Pure lead-gen, no software |
| Houzz | No | No | Low | Discovery-only |
| Porch | No | ML matching | Moderate | Lead quality complaints |
| Handy | No | Yes | Yes | >50% commission |

**Thumbtack is the closest direct threat.** They are spending heavily on photo-based AI diagnosis (April 2026 announcement) but the rollout is incomplete and their output is a trade category, not a written report. Their "home care" pivot is also the most advanced retention play we've seen.

### South African landscape (summary)

| Platform | Diagnosis | Vetting | In-platform booking | AI | Threat level |
|---|---|---|---|---|---|
| Snupit | None | None | None | None | Low (different model — pay-per-lead directory) |
| Kandua + Santam | None | Strong (Santam-backed) | Yes | None | **Highest** — live, well-funded, insurer-integrated, national contractor density |
| SweepSouth | None | Background check | Yes | Minimal | Low (cleaning-only scope) |
| GoodApp | None | Self-certified | Yes | None | Low (early-stage) |
| Bark.com (SA) | None | None | None | None | Negligible (poor reputation) |
| Plentify | Smart geyser only | N/A | Via installer | AI energy mgmt | Adjacent |
| Naked Insurance | None | N/A | Emergency dispatch | Claims AI | Adjacent — partnership candidate |

**Kandua is the most important competitor today.** Santam acquired Kandua in May 2024 specifically for its contractor network. The platform is live and operating with insurer backing, national contractor density, and integration with Santam's claims workflows. Mendr's defensible position is therefore NOT "first-mover into an empty market" — it's "the only platform that combines AI-led fault diagnosis with the contractor's actual operational tooling." Kandua does neither. The speed-to-execute clock is about establishing the diagnosis moat and the operational-tools moat before Kandua adds them.

### What the SA market specifically lacks

1. **AI fault diagnosis from a photo** — no SA platform offers this
2. **Real-time CIDB / NHBRC verification** at the point of matching
3. **Load-shedding-aware scheduling** — universal in SA but unsupported
4. **Insurance documentation integration** — Mendr report could double as a claim asset
5. **Multilingual / WhatsApp-first reporting** — large addressable expansion
6. **Proactive maintenance reminders** — no SA platform does this
7. **Formal contractor tools** — most SA tradespeople run on WhatsApp + paper

---

## 3. Diagnostic quality improvements (Phases 1–5, shipped May 2026)

The diagnostic output quality was overhauled in May 2026 following user testing that revealed the report felt thinner than what users would get from pasting the same problem into ChatGPT. Root causes identified:

- The prompt had stacked length caps that throttled the model
- There was no schema field forcing the model to name the specific failed component (only the affected system)
- `image_descriptions` was a flat string array — the model could collapse multiple per-image observations into a single summary, losing the most diagnostic image
- Self-reported `confidence` was being used to route between providers vs clarification, despite being a fictitious calibration (LLMs do not produce calibrated confidence numbers)
- Only one image could be uploaded; no path to refine with additional photos

### Phase 1 — Prompt depth + schema enrichment (shipped)

- Added `failed_component`, `cascading_damage` to classification schema
- Added `diy_verification`, `photo_request`, `confidence_drivers` to prose schema
- Reframed the `thought` field from a 125-char telegraphic snippet to a 400–700 character reasoning trace, surfaced in the report as "How I worked this out"
- Restructured the message into four named paragraphs (What's happening / Why it develops / What gets worse / Hazard)
- Removed the blanket "no severity words" prohibition
- Report now shows: a "Component identified" line, a "You can verify this yourself" panel, a confidence drivers transparency list

**Prompt version:** v7.0

### Phase 2 — Multi-photo support (shipped)

- DB migration: `image_urls` JSONB column on `diagnoses`, backfilled 583 rows from the legacy `image_url`
- `/start` upload now accepts up to 4 photos with reorder (Phase 11 follow-up made this a drag-and-drop grid)
- Server-side cap at 4 with overflow warnings
- New **MULTI-IMAGE SYNTHESIS PROTOCOL** in the prose prompt: treat as combined evidence, first image gets most attention weight, explicit absence detection rules, explicit conflict-handling rules
- Legacy `image_url` preserved as `image_urls[0]` for backward compat

**Prompt version:** v7.1

### Phase 3 — Refinement with photos (shipped)

- New endpoint `/api/diagnoses/[id]/refine` with `refineDiagnosis` rate-limit bucket
- New photos are positioned FIRST in the parts array (highest attention weight)
- Total image count still capped at 4; older images drop from the back if needed
- REFINEMENT MODE prompt branch tells the model to explicitly note when new images change the diagnosis
- Photo-request panel surfaces prominently when the model has asked for a specific photo
- Refinement bottom-sheet with multi-photo picker + text input

**Prompt version:** v7.2

### Phase 4 — Structural confidence routing (shipped)

Self-reported confidence is uncalibrated. Replaced as routing signal with a deterministic 0–100 score from observable signals:

| Signal | Effect |
|---|---|
| Base | 50 |
| ≥1 image provided | +15 |
| ≥2 images | +5 |
| Description ≥25 words | +10 |
| Description ≥60 words | +5 |
| `subcategory_id` matched (not `none_unmapped`) | +15 |
| `failed_component` non-empty | +10 |
| `General Handyman` AND 0 images | −15 (catch-all without visual evidence) |
| Rejected/unserviced/N/A | Score forced to 0 |

Threshold for showing providers: `score >= 70` (replaces old `confidence >= 85`). Old diagnoses without a structural score fall back to the legacy check for backward compatibility.

New helper: `shouldShowProvidersForDiagnosis()` is the single source of truth across `/api/diagnose`, `/api/diagnoses/[id]/refine`, and the processing orchestrator.

New admin panel: "Diagnostic confidence" histogram showing distribution and top below-threshold signals. Drives prompt iteration decisions.

### Phase 5 — Cross-image synthesis hardening (shipped)

The garage door case (homeowner photographs missing torsion spring + bent rod, gets back "the door is opening skewed") drove this phase. The cause: image_descriptions could collapse per-image observations into a single summary.

- Replaced `image_descriptions: string[]` with structured `image_observations`:
  ```
  { primary_observation, components_visible[], components_missing_or_damaged[], role_in_diagnosis }
  ```
- `role_in_diagnosis` is exactly one of `primary_evidence | corroborating | contradicting | context_only`
- Exactly one image must be tagged `primary_evidence` (the strongest direct evidence)
- New **CROSS-IMAGE OBSERVATION TABLE** prompt block forces enumeration before commitment
- Report UI now shows a card per image with the role badge; an amber alert surfaces when any image is tagged `contradicting`
- `image_descriptions` preserved as a server-derived array for backward compat

**Prompt version:** v7.3

### Phase 11 — Drag-and-drop grid photo picker (shipped)

After multi-photo support landed in Phase 2, the UI was a horizontal row with manual reorder arrows. Replaced with a 2-column grid with native HTML5 drag-and-drop swap on desktop and a `•••` dropdown menu for mobile (no DnD library installed).

### Bug-fix sweep (shipped May 22)

Post-Phase 5 verification surfaced four real regressions the agents had missed:

1. **Processing orchestrator dropped `image_urls`** — only persisted `image_url` (singular). Result: refreshing the diagnosis page showed only the first photo. Fixed.
2. **Processing page initial patch dropped `image_urls`** — same bug at a different layer. Fixed.
3. **Message rendered as a single `<p>` with `whitespace-pre-wrap`** — the new four-paragraph format looked like a wall of text. Now split on `\n{2,}` into proper `<p>` blocks. Fixed in both `/report/[id]` and `/diagnosis` pages.
4. **Refine route lost the original homeowner description** — sent only the refinement text + new images to Gemini, which sometimes flipped to `unserviced=true` because it lost context. Now prepends `ORIGINAL DESCRIPTION (do NOT discard)` to the new turn. Fixed.

---

## 4. Future roadmap by theme

This is the active backlog distilled from the broader competitive research, organised by strategic theme. Phases 1–5 above were the diagnostic-quality theme. The following themes are still ahead.

### Theme A — Trust & safety (SA-specific moat)

SA's home-services market is uniquely trust-deficient. The original analysis identified these as the highest-leverage trust signals Mendr can build:

1. **Live CIDB & NHBRC verification badges** — both registers are publicly queryable. No SA platform does this programmatically. The `certifications/catalog.ts` already has `requires_verification: true` flags ready for this work.
2. **Diagnosis report as insurance documentation** — Mendr reports are date-stamped, AI-generated, and structurally formatted. With a PDF export and explicit insurance-claim framing, they immediately gain a second purpose. Partnership with Naked Insurance is the natural BD play.
3. **Public liability verification** — require document upload at contractor onboarding, surface verified expiry date, cron-flag expiring certs.

### Theme B — Homeowner stickiness

Detailed in `03-homeowner-retention.md`. Key components:

1. **Home history / job ledger** — every diagnosis becomes a timestamped maintenance record
2. **Seasonal maintenance reminders** — proactive engagement keyed to Western Cape climate
3. **Post-job completion flow with rating** — already shipped (May 22, 2026)
4. **Saved contractors** — already shipped
5. **Insurance-doc framing on report PDFs**
6. **Load-shedding-aware appointment scheduling**

### Theme C — Contractor stickiness + monetisation

Detailed in `02-contractor-retention-and-pricing.md`. Summary:

1. **Contractor dashboard** with lead intelligence, real-time notifications, profile completeness
2. **Built-in quoting, invoicing, payments** — full business operating system
3. **Subscription tiers** designed to make leaving genuinely painful
4. **Marketplace pull + SaaS tools** — the combination is uniquely defensible

### Theme D — AI differentiation extensions

Beyond Phases 1–5:

1. **Video diagnosis support** — when `structural_confidence < 70`, offer a 15–30 second video upload, extract frames for the Gemini call. Solves the "intermittent fault" case.
2. **Follow-up diagnosis detection** — when a homeowner reports a fault in roughly the same area as a previous one, surface that history.
3. **Multi-photo synthesis at video timescale** — extending Phase 5's cross-image protocol to multi-frame video.
4. **Confidence calibration via fine-tuning** — the founder's honours thesis explicitly targets this for end-of-2026 delivery. Fine-tuned Gemini 2.5 Flash via Vertex AI LoRA. Until then, structural confidence is the routing signal.

### Theme E — SA-specific opportunities

1. **WhatsApp-first diagnosis flow** — full WhatsApp Business channel where a photo + voice note returns a diagnosis. Highest reach impact.
2. **Multilingual fault description (Afrikaans + Xhosa)** — voice transcription already integrated.
3. **Estate / body corporate bulk mode** — B2B segment for property managers.
4. **Load-shedding emergency triage** — fast-track path with pre-vetted solar/electrical specialists.

---

## 5. Sequencing recommendation

Based on impact-to-effort across themes:

| Quarter | Themes | Outcome |
|---|---|---|
| Q3 2026 | Theme B (homeowner stickiness MVP: home history + post-job rating + saved contractors) | Already shipping. Closes the "single-use" risk |
| Q3 2026 | Theme C (contractor dashboard + real-time lead notifications + Pro tier) | First contractor revenue line |
| Q4 2026 | Theme A (CIDB/NHBRC live verification + insurance partnerships) | Trust moat that Snupit/Kandua cannot easily replicate |
| Q4 2026 | Theme D (video diagnosis) | Closes intermittent-fault gap |
| Q1 2027 | Theme E (WhatsApp + multilingual) | Reach expansion |
| 2027 | Theme D (fine-tuned model after thesis) | Calibrated confidence, real accuracy gains |

The Kandua + Santam pressure applies most to Themes A and C. Mendr's structural advantage is the diagnosis + operational-tools combination; ship both moats before Kandua/Santam expand from marketplace into either.

---

## 6. What we are explicitly NOT building

- Pay-per-lead model. The founder's explicit decision: too adversarial, erodes lead quality, structurally hostile to contractors.
- Web search inside the diagnosis pipeline. Adds noise, doesn't solve the visual-recognition limitation.
- Chat-style diagnosis. The written report is the differentiator; chat erodes its authority. Targeted clarification only.
- More than 4 images per diagnosis. Attention dilution becomes the dominant effect past this point.
- Self-reported confidence as a routing signal. Replaced in Phase 4.
- General "how to fix it yourself" content. Competes with monetisation and risks hallucinated DIY advice.

---

*References: international competitor research (`agent: claude general-purpose`), SA local competitor research (`agent: claude general-purpose`), both run May 2026. Full raw research output preserved in session transcript.*
