# Prompt Changelog

This file records every meaningful change to the Mendr diagnosis prompt system.
It exists so that AI assistants and developers never re-suggest an approach that has
already been tried and rejected, and so that regressions can be traced to a specific
change rather than discovered through user support tickets.

**Update this file whenever `DIAGNOSE_PROMPT_VERSION` is bumped.**

Format for each entry:

```
## v[version] — [date]
**Changed:** [what was modified and in which file]
**Problem solved:** [what user-facing or model behaviour issue prompted this]
**Regressions / known side-effects:** [anything that got worse or needed a follow-up fix]
**Why this approach:** [key reasoning — especially if alternative approaches were rejected]
```

---

## v7.4 — 2026-05-23

**Changed:** `user-turn.ts` — added a single-side fallback paragraph to both `buildStreamingQuickThoughtPrompt` and the image-first prompt (multi-image branch). The fallback tells the model to look for negative-space cues (empty fastener points, paint shadows, dangling free ends, brackets with no part attached) when only one side of a fault is photographed. `prompt-version.ts` bumped to v7.4.

**Problem solved:** 2026-05-23 garage-spring failure case. A user uploaded 4 photos of a motorised wooden gate with a missing lift spring. The existing absent-component detection assumed left-vs-right symmetry — it could only detect missing parts by comparing sides. The user (correctly) only photographed the broken side, so the heuristic never fired. The classifier returned `trade: 'N/A'` + `requires_clarification: true`, and the UI surfaced "We can't match this job" instead of asking clarification questions.

**Regressions / known side-effects:** could over-detect "missing" parts in close-ups where a fastener point legitimately has nothing on it by design (e.g. an unused mounting hole, hose-bib threading, electrical knockout, junction-box punchout). Mitigated by requiring the prompt to anchor on a CONTEXTUAL cue (wear pattern, paint shadow, surrounding installation) before claiming a missing part. Watch the next 2 weeks of diagnoses for false-positives around those features.

**Why this approach:** the alternative was per-trade anatomy schemas (recommendation B2 in `docs/diagnosis-accuracy-and-ux-recommendations.md`), which is the more thorough fix but takes ~1 day to build and eval. The single-side fallback is ~30 minutes of prompt work and addresses the highest-traffic failure mode. Per-trade schemas remain on the roadmap.

---

## v7.3 — 2026-05-22

**Changed:** `agent-prose.ts` (new `image_observations` structured array added to PROSE_SCHEMA and `ProseResult`; new `normaliseImageObservations` helper; post-parse derivation of `image_descriptions` from `image_observations` when missing; CROSS-IMAGE OBSERVATION TABLE block appended to the visual block of the prose system prompt). `features/diagnosis/types.ts` gains optional `image_observations` field. Report UI (`report-detail-content.tsx`) replaces the flat extra-images grid with a per-image observation section that pairs each image with a role badge, the primary observation, visible components and issues spotted; a top-of-section alert appears when any image is tagged `contradicting`.

**Problem solved:**
- Multi-image diagnoses were silently collapsing distinct per-image findings into a single summary. Real-world case: two clear photos (missing torsion spring + bent connecting rod) yielded a diagnosis of "door opening skewed" with no mention of either component. The model saw the photos but the output schema gave it no slot that forced enumeration before synthesis.

**Behaviour:**
- For every submitted image (1-4), the model now produces an `ImageObservation` with: `primary_observation` (5-20 words), `components_visible`, `components_missing_or_damaged`, and `role_in_diagnosis` (one of `primary_evidence` | `corroborating` | `contradicting` | `context_only`).
- Exactly one image is tagged `primary_evidence` whenever at least one image is submitted. If two photos point to different causes the second is tagged `contradicting`, the conflict is named in `thought`, and confidence is lowered.
- `image_descriptions` is preserved for backward compatibility — when the model leaves it empty (or omits it), the server derives it from each observation's `primary_observation` so older consumers continue to work.
- Report UI shows a per-image card under each thumbnail with a role badge (green for primary, neutral for corroborating, orange for contradicting, muted for context). When any photo is `contradicting`, a small alert appears above the photo section.

**Why this approach over alternatives:**
- A second LLM pass to enumerate per-image observations was rejected — Gemini 2.5 Flash already has all images in parallel attention, so the fix is to force the OUTPUT structure to demonstrate that consideration, not to re-look at the photos.
- Replacing `image_descriptions` outright was rejected — too many downstream consumers (refinement endpoint, processing client, legacy reports). Deriving it server-side preserves the contract while letting the model focus on the richer structure.

**Regressions / known side-effects:**
- Output tokens per diagnosis go up by a small but measurable amount (one structured object per image instead of one short sentence). Cost monitored via `logGeminiUsage`.
- Old diagnoses without `image_observations` render via the existing flat `extraImages` grid — no per-image cards.

---

## v7.2 — 2026-05-22

**Changed:** `prompts/followup.ts` (new `buildRefinementWithNewImagesPrompt`), `prompts/composer.ts` (emits the new block in both `buildSystemInstruction` and `buildProseBaseInstruction`), `prompts/types.ts` (`PromptContext.isRefinementWithNewImages`). New endpoint `app/api/diagnoses/[id]/refine/route.ts` re-runs the two-agent pipeline with `additionalImageUrls` prepended to the existing `image_urls`. Database migration `diagnoses_image_refinement_log` adds an append-only JSONB array recording each refinement event.

**Problem solved:**
- After an initial diagnosis, users could only refine via text. They had no way to attach more photos — the single most common reason diagnoses underperformed.
- The new `photo_request` field on Agent 2b output (introduced in v7.0) was being generated but not surfaced anywhere. It now drives a prominent prompt on the report page that opens the refinement sheet.

**Behaviour:**
- New images submitted during refinement are placed FIRST in the parts array Gemini sees. Original images follow. Combined count is capped at 4 by silently dropping the OLDEST images from the back of the array (with a server-side warning).
- REFINEMENT MODE prompt block tells the model: weight the new images, update the diagnosis if they contradict the prior conclusion, corroborate when they agree, do not invent unsupported faults, and try to answer the prior `photo_request` if one was set.
- Refinement does NOT consume daily diagnosis quota (only the first message in a conversation does); it does pay its own `refineDiagnosis` rate-limit bucket.

**Why this approach over alternatives:**
- Reusing `/api/diagnose` was considered but the route is already large and has multiple branches (text-only, image, provider hydration, quick thought, streaming). A thin dedicated endpoint at `/api/diagnoses/[id]/refine` keeps the call site clean and makes the new-photos-first ordering explicit, while still calling the existing `runClassification` / `runProseGeneration` agents — no parallel pipeline.
- Placing new images last (original-style "primary" first) was rejected because the homeowner's refinement is literally a "look at this new evidence" act; Gemini's first-image attention bias should serve that.

**Regressions / known side-effects:**
- Image cap is still 4. Heavy refiners may see older photos silently dropped — this is logged server-side; UI hints at remaining slots.

---

## v7.1 — 2026-05-22

**Changed:** `agent-prose.ts` (visualAndUrgencyBlock fully replaced with explicit MULTI-IMAGE SYNTHESIS PROTOCOL; `imageInstruction` extended to reference the protocol when imageCount > 1). Database migration `diagnoses_multi_image_support` adds `image_urls jsonb` alongside the legacy `image_url text`. Server cap of 4 images per diagnosis enforced in `/api/diagnose/route.ts`.

**Problem solved:**
- Mendr previously persisted only ONE image per diagnosis (`diagnoses.image_url`). Faults that need multiple angles (e.g. garage door with broken spring + bent connecting rod + damaged rail) could not be evidenced properly.
- Gemini 2.5 Flash processes images in parallel attention — the FIRST image carries the most weight. The prior single-line multi-image rule buried in `agent-prose.ts` did not give the model an explicit protocol for absence detection or conflict handling.

**Changes:**
- Added `image_urls jsonb` to `public.diagnoses`, backfilled from existing `image_url` (legacy column retained for backward-compat reads).
- Cap of FOUR images per submission enforced both client-side (UI blocks adding a 5th) and server-side (extras dropped with a warning).
- New explicit MULTI-IMAGE SYNTHESIS PROTOCOL: treat all images as a single evidence base; weight the first image as the user's primary view; anchor the diagnosis to the clearest fault image; absence detection across symmetric features; explicit conflict-handling step that lowers confidence rather than silently committing.
- `image_descriptions` rule is now stricter: EXACTLY one entry per image in input order.
- Client upload UI on `/start` accepts up to 4 photos, shows a reorderable thumbnail strip with a "Primary" badge on the first, and submits `imageUrls: string[]` in user-specified order.
- Report page consumes the new `image_urls` JSONB array (falls back to `image_url` for older rows).

**Why this approach over alternatives:**
- A schema migration was preferred over packing URLs into the diagnosis JSONB blob because images are owned by the row, not the model output — they need to persist even if the diagnosis JSON is regenerated.
- The legacy `image_url` column is intentionally retained for one release so any read path not yet migrated continues to work; a follow-up migration will drop it.
- Four images is a chosen ceiling: past four, Gemini Flash attention dilutes faster than the diagnostic value of additional photos.

**Regressions / known side-effects:**
- Older diagnoses without `image_urls` (created before this migration) render via fallback to `image_url`; no UX regression observed.
- 33 pre-existing rows already violated the `diagnoses_diagnosis_shape_check` constraint and were skipped during backfill (constraint was `NOT VALID` and re-added as `NOT VALID` after the UPDATE; data integrity unchanged).

---

## v7.0 — 2026-05-22

**Changed:** `agent-classify.ts` (schema + interface), `agent-prose.ts` (schema + interface + min-length guard), `prompts/output-format.ts` (MESSAGE RULES + JSON FORMAT), `prompts/base.ts` (REPORT DEPTH), `types.ts` (additive optional fields), report UI (`report-detail-content.tsx`).

**Problem solved:**
- Diagnoses felt thinner than pasting the same problem into ChatGPT/Claude. Root cause: stacked length caps on `thought` and `message`, blanket prohibition on severity language ("significant", "serious", "unsafe"), and no schema slot forcing the model to identify the specific failed component.
- Real-world failure case: garage door with missing torsion spring and bent connecting rod was diagnosed only as "door opening skewed" because there was no `failed_component` or `cascading_damage` field.

**Changes:**
- Added `failed_component` and `cascading_damage` to the classification schema (Agent 2a).
- Added `diy_verification`, `photo_request`, and `confidence_drivers` to the prose schema (Agent 2b).
- Reframed `thought` from a 125-character telegraphic snippet into a 400-700 character reasoning trace (the homeowner-facing "How I worked this out" panel).
- Restructured message rules into four named paragraphs (What's happening / Why it develops / What gets worse / Hazard) — paragraphs 3 and 4 are conditional, not mandatory padding.
- Removed the blanket prohibition on severity words; the model may now use "serious", "significant", or "unsafe" when factually applicable.
- Report UI surfaces a "Failed Component" line, a "You can verify this yourself" panel, and a more prominent "How I worked this out" reasoning panel (with confidence drivers as bullets).

**JSON-blob-only:** No DB migration. `DiagnosisData` is stored as JSON in `diagnoses.diagnosis`; all new fields are optional and existing diagnoses continue to render.

**Why this approach over alternatives:**
- A DB migration was rejected — `diagnoses.diagnosis` is already a JSON blob, so additive fields just appear at read-time.
- Allowing the model to write longer reasoning was preferred over post-hoc enrichment (a second LLM call to expand a short thought) because thinking quality drops sharply when reasoning is fragmented across multiple passes.

**Regressions / known side-effects:**
- Output tokens per diagnosis go up materially (longer `thought`, new fields). Cost monitored via `logGeminiUsage`.
- `photo_request` is stored but not yet rendered — Phase 3 UI work.

---

## v6.0 — May 2026

**Changed:** Base prompt (`base.ts`), output format (`output-format.ts`), composer (`composer.ts`), two-agent split introduced (`agent-classify.ts`, `agent-prose.ts`).

**Problem solved:**
- The single-agent approach was producing trade drift on follow-up turns — the prose model would contradict the classification made in an earlier turn when provider context was injected.
- Classification fields (trade, urgency, confidence, rejected flag) were being re-generated alongside narrative fields, meaning a single temperature setting had to serve both structured JSON accuracy and natural prose quality.
- Provider hydration (injecting a contractor's profile to generate a personalised match message) was re-running the full classification unnecessarily.

**Architecture change:**
Replaced the single Gemini call with a two-agent pipeline:
1. **Agent 2a — Classification** (`agent-classify.ts`): schema-enforced JSON call at `temperature: 0.1`. Locks in `trade`, `trade_detail`, `subcategory_id`, `urgency_key`, `confidence`, `rejected`. Never runs on follow-up turns where classification is already settled.
2. **Agent 2b — Prose** (`agent-prose.ts`): receives Agent 2a's output as ground truth injected into the system prompt. Generates only narrative fields: `thought`, `diagnosis`, `message`, `action_required`, `estimated_cost`, `image_descriptions`. Runs at `temperature: 0.35` (or `0.22` for provider hydration passes).

**Why this approach over alternatives:**
- Function calling was considered but adds latency and SDK complexity without the classification stability benefit.
- A single call with a split schema (classification fields first, prose fields second) was tried implicitly in v5.x — the model still produced conflicting values across the two sections because there was no "ground truth injection" step.
- The two-agent approach means the prose model literally cannot contradict the classification because the classification is in its system prompt as stated fact.

**Regressions introduced:**
- Approximately 20–30% increase in total token cost per diagnosis (two Gemini calls vs one). Mitigated by making Agent 2a very cheap (`maxOutputTokens: 520`, schema-enforced JSON).
- Follow-up turns that only need prose now still run Agent 2a — tracked as a future optimisation (skip classify on turns where the user has not contradicted the trade).

---

## v5.x — March–April 2026

**Changed:** Multiple iterative changes to the base prompt, output format blocks, and provider hydration prompt.

**Problem solved:**
- Model was producing vague diagnoses ("Electrical Issue", "Plumbing Problem") instead of specific fault descriptions.
- Model was deferring to clarification even when equipment was clearly identifiable in the image.
- Trade labels were not matching the Supabase service catalogue, causing the match page to show zero results.

**Key additions to base prompt:**
- `ESTIMATED DIAGNOSIS: Always provide a specific estimated diagnosis... Never use vague labels like "Electrical Issue".`
- `Be PROACTIVE: When you can clearly identify the equipment... give a FULL diagnosis immediately.`
- `USER CORRECTIONS BEAT THE PHOTO:` rule — explicit user statements override image-based inference for ambiguous equipment (e.g. pool vs borehole pump, gate vs garage door motor).

**Regressions:**
- The `USER CORRECTIONS BEAT THE PHOTO` rule caused over-correction in v5.2 — the model began updating the trade even for casual conversational corrections ("actually I think it might be..."). Fixed in v5.3 by adding "explicit statement" and "clearly corrects" qualifiers.

---

## v4.x — February 2026

**Changed:** Initial multi-turn conversation support. Output format introduced `clarification_questions[]` array.

**Problem solved:**
- Single-turn diagnosis was producing wrong trades when images were ambiguous (e.g. a close-up of a wire could be electrical, gate motor, or pool pump wiring).
- The app had no mechanism to ask targeted follow-up questions before committing to a trade.

**Key additions:**
- `requires_clarification` boolean field — when `true`, the app withholds provider recommendations and shows clarification UI instead.
- `clarification_questions[]` — model-generated list of targeted follow-up questions.
- Follow-up mode: when a conversation has > 1 turn with an existing diagnosis, the model is instructed to keep `thought` brief and only update trade/diagnosis if the user explicitly corrects it.

**Regressions:**
- `requires_clarification: true` was being set too aggressively in v4.0 — the model would defer even when equipment was obvious. Root cause: the instruction "if the image is genuinely ambiguous" was being over-applied to any multi-appliance image. Fixed in v4.2 by adding explicit positive examples of when to diagnose immediately.

---

## v3.x — January 2026

**Changed:** Output format standardised to NDJSON streaming. Prompt version tracking introduced.

**Problem solved:**
- The app was parsing the full Gemini response as a single JSON blob after the stream completed. This meant users saw nothing until the entire response was ready (3–8 seconds).
- Streaming individual fields (especially `thought`) allowed the processing page to show progress in real time.

**Architecture:**
- Introduced `diagnose-ndjson-stream.ts` for client-side stream parsing.
- `thought` field moved to be the first key in the output schema so it streams to the client first.
- `DIAGNOSE_PROMPT_VERSION` constant introduced for support debugging.

---

## What to Check Before Modifying Any Prompt File

1. **Read this file first.** If the change you are about to make resembles something in a "Regressions" section, that approach has already been tried. Talk to Matthew before proceeding.

2. **Run the golden tests.** `src/lib/__tests__/parse-diagnosis.test.ts` has 18 test cases covering edge cases in JSON parsing. These must stay green.

3. **Check the taxonomy.** Trade labels in the output must match the labels in `src/lib/diagnosis-trade-taxonomy.ts`. A trade label that does not exist in the taxonomy will cause zero provider matches on the match page.

4. **Bump the version.** After any meaningful change, increment `DIAGNOSE_PROMPT_VERSION` in `prompt-version.ts` and add an entry to this file.

5. **Test on mobile.** The homeowner-facing flow is used predominantly on phones. Test the full flow on iOS Safari before merging prompt changes.

---

*Last updated: May 2026. Owner: Matthew Prowse.*
