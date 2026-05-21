# Prompt Changelog

This file records every meaningful change to the Menda diagnosis prompt system.
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
