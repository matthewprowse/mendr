# Diagnosis accuracy + UX recommendations

Synthesised from a real-world failure case (motorised gate with a missing spring — see [`failure-case-garage-spring.md`](./failure-case-garage-spring.md) if captured) and a walkthrough of the diagnosis pipeline. Recommendations are organised by *what they fix* and *what they cost*.

**Author:** Matthew Prowse (with Claude)
**Last updated:** 2026-05-23

---

## TL;DR — the 5 highest-leverage changes

| # | Change | Effort | Impact |
|---|---|---|---|
| 1 | Show clarification questions even when `trade === 'N/A'` (currently they're hidden by the "service blocked" branch) | **30 min** | Eliminates the worst-flavour error message; turns dead ends into conversations |
| 2 | Normalise EXIF orientation before sending images to Gemini | **1–2 hours** | Stops the model seeing iPhone photos sideways |
| 3 | Add a single-side fallback to the absent-component detection prompt (don't require left-vs-right symmetry) | **2 hours + eval** | Catches missing-part cases like the one we hit |
| 4 | Replace `confidence` self-report with the existing `structural_confidence` everywhere it gates UI | **half day** | Honest confidence; fewer hallucinated diagnoses |
| 5 | Pre-upload guidance + per-image "which shows the actual problem?" prompt | **1 day** | Better inputs → better outputs; fewer rejections without lowering the bar |

If you only do 5, do those.

---

## A. Fix the immediate UX bugs

These are pure code changes, no model work. Ship them first.

### A1. Clarification beats "service blocked" when questions exist
**File:** [`src/app/diagnosis/client.tsx:1018`](../src/app/diagnosis/client.tsx)

Current branching:
```ts
const isServiceBlocked = isUnsupportedDiagnosis || isUnrelatedDiagnosis;
const resolvedDetailText = isServiceBlocked
    ? DIAGNOSIS_REJECT_DETAIL
    : requiresClarification
      ? 'Please pick one of the quick options below…'
    : diagnosisDetailText;
```

`isUnsupportedDiagnosis` fires when `trade === 'N/A'` — but the classifier returns `'N/A'` for two very different reasons: *"I don't know which trade"* and *"this trade isn't in the catalogue."* Conflating them tells users we don't service things we obviously do.

**Fix:**
```ts
const hasUsableClarification =
    requiresClarification && (clarification_questions?.length ?? 0) > 0;

if (hasUsableClarification) {
    // ASK the user — model has questions
} else if (isUnrelatedDiagnosis) {
    // Genuinely not home maintenance
} else if (tradeIsExplicitlyNotInCatalog) {
    // Trade is set AND not in the catalogue
} else {
    // Normal happy path
}
```

Acceptance test: re-run the gate-spring case; user should see clarification questions, not "not on Mendr's list."

---

### A2. Normalise EXIF orientation before upload
**Files:** [`src/lib/image-compression.ts`](../src/lib/image-compression.ts), [`src/app/api/upload-image/route.ts`](../src/app/api/upload-image/route.ts), [`src/app/api/diagnose/image-loader.ts`](../src/app/api/diagnose/image-loader.ts)

iPhone photos taken in portrait are stored landscape with an EXIF rotation tag. If the upload pipeline doesn't bake the rotation into pixels, Gemini sees the photo sideways. One of the four photos in the failure case was clearly rotated 90° even in the previewer.

**Fix:** when re-encoding (we already convert HEIC → JPEG), apply EXIF orientation to pixels and strip the tag. `heic-convert` likely handles this; the client-side compression path may not.

Acceptance test: upload a portrait HEIC, inspect the bytes that arrive at Gemini, verify the image is upright.

---

### A3. Expand trade-taxonomy keywords
**File:** [`src/lib/services.ts`](../src/lib/services.ts)

The mapping has `gate motor`, `garage door`, `intercom` under Security. Missing keywords that came up in the failure case:
- `roller shutter`, `shutter door`
- `gate track`, `gate roller`
- `garage spring`, `torsion spring`, `extension spring`
- `up and over`, `tilt door`, `canopy door`
- `gate hinge`, `gate arm`

**Fix:** add the keywords + a regression test fixture so the taxonomy doesn't drift.

---

### A4. The "Your Mendr Report" copy is wrong on rejection
When `isServiceBlocked`, the page still reads *"Here is what your photos suggest and sensible next steps…"* — false promise. Rejection states need their own page subtitle.

---

## B. Make the model better at detecting missing components

These are prompt + fixture changes.

### B1. Single-side fallback for absent-component detection
**File:** [`src/features/diagnosis/prompts/user-turn.ts`](../src/features/diagnosis/prompts/user-turn.ts)

Current prompt strategy relies on left-vs-right symmetry:
> *"compare left vs right, near vs far, upper vs lower. A component present on one side but ABSENT or detached on the other is the PRIMARY fault signal"*

This fails when the user only photographed the broken side (which they often will — they don't realise they need the comparison). The model needs a fallback heuristic.

**Add:**
> *"If you can see a fastener point (slot, eye, hook, threaded hole, mounting bracket) that has no fastener or part attached, and the surrounding context implies something should be attached there (e.g. a wear pattern, a paint shadow, a matching socket on a similar nearby component), name the absent part explicitly — even if the comparison side is not in frame."*

Pair with a fixture test: feed a single-photo missing-spring case, assert the parser pulls out `"spring"` as the named absent component.

---

### B2. Schema-aware prompting per trade
The model is told the catalogue of trades, but not the **anatomy** of common installations. A garage-door diagnosis would benefit from being told: *"a wooden tilt-up garage door has two springs (left + right), two hinge brackets, a centre handle, side guide tracks."* Then "missing spring" becomes an obvious negative-space inference.

**Approach:**
- Maintain a small dictionary in [`src/features/diagnosis/prompts/`](../src/features/diagnosis/prompts/) keyed by trade → component schema
- Inject the relevant schema fragment into the prose prompt **once the classifier has provisionally chosen a trade**
- Don't bloat the prompt with all trades — only the one(s) the classifier is considering

**Effort:** 1 day to draft 4–5 trade schemas (garage doors, plumbing fixtures, electrical panels, pool pumps, geyser units) + eval against historical fixtures.

---

### B3. Enforce `primary_evidence` selection
The prose schema already has `image_descriptions[i].relevance: 'primary_evidence' | 'corroborating' | 'contradicting' | 'context_only'` — but it's self-reported and the rest of the pipeline doesn't act on it.

**Fix:**
- Require exactly one `primary_evidence` per multi-image diagnosis (already in the prompt — needs runtime validation)
- When confidence is low, **bias the diagnosis text toward the primary_evidence image** instead of synthesising across all
- Show the user "we focused on photo #2 — was that the right one?" with the option to nominate a different image as primary

This turns "I have 4 photos and don't know which to trust" into "I focused on this one — confirm?"

---

### B4. Per-image observations need to be re-checked, not just generated
The pipeline currently asks the model for `image_observations[]` (one per image). But there's no consistency check: if the model says "image 1 shows a wooden gate, image 2 shows a roller shutter" — those are different objects and should reduce overall confidence. Right now they just get concatenated.

**Fix:** after the prose call, run a tiny "do these observations describe the same installation?" check. If the model's own observations contradict, force `requires_clarification: true` and ask "is this one job or multiple?"

---

## C. Get better inputs from users

The fastest accuracy improvement isn't a smarter model — it's better photos.

### C1. Pre-upload guidance
**Files:** [`src/app/start/`](../src/app/start/), [`src/app/diagnosis/`](../src/app/diagnosis/)

Before the camera opens, show:
- **One example photo** of a well-framed fault (filled frame, in focus, single component) labelled "Like this"
- **One badly-framed photo** labelled "Not this" (wide shot of a whole garage, multiple objects in frame)
- A short checklist: ✅ broken part fills the frame · ✅ daylight or good lighting · ✅ a second photo with context (whole door / whole pipe / whole panel)

This is the single biggest lever in the whole product. Computer vision models trained on internet images are best at clean object-centric photos and worst at wide-angle "here's my garage" shots.

---

### C2. Make text description irresistible, not optional
The failure case was 4 photos and no description. The system tried to do all the inference from pixels.

**Options:**
- Make the text field the **first** input, not the upload (description-first flow)
- Auto-prompt with voice-to-text on mobile ("Tap the mic, say in 5 seconds what's wrong")
- Pre-populate with a suggested sentence based on the first image's `image_observations[0]` and let the user edit ("Looks like a *garage door* — anything else?")

Even one sentence of user context lifts classification confidence significantly.

---

### C3. Per-image "which one shows the actual problem?"
After upload but **before** classification, if the user uploaded ≥3 photos, ask them to tap the one that best shows the problem. That photo gets weighted higher in the prompt:

> *"Photo 2 is the user-nominated primary evidence. Treat it as the most important. Photos 1, 3, 4 are context."*

This is the human providing the asymmetry-anchor the model couldn't find on its own.

---

### C4. Capture intent before camera
A 1-tap multiple-choice **before** photo upload ("What's broken? — Plumbing / Electrical / Door / Gate / Other / Not sure"). This isn't binding — the model can still override — but it gives the classifier a strong prior, especially when the photos are ambiguous.

This is already in the schema (`userSelectedTrade`) but isn't surfaced as a pre-upload UX step on the homeowner flow.

---

## D. Make confidence honest

The system has *two* confidence signals — the model's self-reported `confidence` and the derived `structural_confidence`. They behave differently, and the UI sometimes uses the wrong one.

### D1. Audit `confidence` vs `structural_confidence` usage
**File:** [`src/lib/diagnosis/structural-confidence.ts`](../src/lib/diagnosis/structural-confidence.ts) (already has 20 unit tests from the existing suite)

Trace every place the UI gates on confidence:
- The `shouldShowProvidersForDiagnosis` check in [`processing-orchestrator.ts:77`](../src/features/diagnosis/processing-orchestrator.ts)
- Any badge / colour-coding on the report page
- Match-page eligibility

Each should use `structural_confidence` (derived from observable signals like image count, observation specificity, asymmetry findings) rather than the model's self-report.

LLMs are notoriously bad at calibrating self-confidence. A model that says `confidence: 0.95` is right ~70% of the time on visual fault diagnosis in the literature. Structural confidence is harder to game.

---

### D2. Pattern-match "I'm guessing" in the output
Add a post-prose guard that scans the diagnosis text for hedging patterns:

> *"appears to be", "looks like it might", "could possibly", "may indicate", "without more information"*

If those phrases dominate the diagnosis, force `requires_clarification: true` regardless of the self-reported confidence. The model is literally telling us it's unsure — listen to it.

There's a related file [`src/lib/ai/llm-content-guard.ts`](../src/lib/ai/llm-content-guard.ts) that already does refusal detection — extend it.

---

### D3. Multi-pass / ensemble for borderline cases
When confidence is in the 0.4–0.65 range, run the diagnosis **twice** with slightly different prompt framings (e.g. one anchored on "what is the most obvious component-level fault" and one anchored on "what would a professional notice first"). If both passes agree on trade + diagnosis, boost confidence. If they disagree, trigger clarification.

**Cost:** 2× Gemini calls on ~15% of diagnoses → maybe +15% on per-diagnosis cost. Probably worth it for the accuracy lift on the cases that fail right now.

---

### D4. Calibration logging
Every diagnosis should log:
- Self-reported confidence
- Structural confidence
- Whether the user accepted it (proceeded to match) or hit "this isn't right"
- Whether a contractor was actually booked
- Outcome if known (job completed / homeowner reported back)

Then you can build a calibration curve: *"when the model says 0.85, the user accepts 60% of the time."* That's the data you need to set thresholds, not gut feel.

---

## E. Turn rejections into conversations, not dead ends

The current rejection UX is a wall. Even when the system can't diagnose, it shouldn't *abandon* the user.

### E1. Always offer something
When confidence is too low to recommend a specific contractor, the UI should still:
- Show the model's best guess as a hypothesis ("This might be a garage door spring — does that sound right?")
- Offer a "Yes, that's it" button that boosts confidence and proceeds
- Offer "No, it's about…" with the top 3–5 trade options
- Offer a free-text "tell us in your own words"

Right now it's a hard reject with copy-paste re-scan instructions. Most users will close the app.

---

### E2. Soft-suggest the most likely trade
Even when `trade === 'N/A'`, the classifier internally considered a ranked list. Surface it:

> *"We're not sure — your photos could be about: 1) Security (gate/garage), 2) Building & Construction, 3) Welding. Tap the one that fits."*

This needs the classifier to emit a `trade_candidates: Array<{trade, score}>` rather than just the winner. Schema change, but it's a one-line addition to the Zod schema in [`agent-classify.ts`](../src/features/diagnosis/agent-classify.ts).

---

### E3. Photo coaching, not just "try again"
When rejection happens, give specific photo guidance based on the observations the model *did* make:

> *"We saw what looks like a wooden gate hinge in photo 1. Try a close-up showing the hinge with whatever it normally attaches to — especially if part of that connection is missing."*

The model knows what it saw. It can tell the user what's missing.

---

### E4. Human-in-the-loop escape hatch
For borderline cases (confidence 0.3–0.5), offer an opt-in: *"Want a Mendr team member to look at this? We'll get back to you in 2 hours."* For a paid product this is the premium SKU. For the free tier this is the data-collection path — and the data is gold for fine-tuning later.

---

## F. Observability & continuous improvement

You can't improve what you don't measure. Most of these are cheap to add and pay off forever.

### F1. Capture every rejection to a review queue
Every `isServiceBlocked` or `requires_clarification` outcome → log to a Supabase `diagnosis_rejections` table with:
- The exact request payload
- The model's response (full, not just the parsed result)
- The user's photos (consented storage)
- The user's subsequent action (re-scan, abandoned, manual contact)

Review these weekly. Patterns will emerge: *"all the missing-spring cases are rejected"*, *"all the photos taken at night fail"*, etc.

---

### F2. Fixture-driven regression suite for hard cases
The failure case from this session (4 photos, missing spring, garage door) should become a fixture in [`src/features/diagnosis/__tests__/fixtures/`](../src/features/diagnosis/__tests__/fixtures/) with the **expected** classifier output:

```json
{ "trade": "Security", "requires_clarification": true, "clarification_questions": [...] }
```

Then any prompt change that makes this case worse fails CI. Build the suite up over time — every rejected case the team triages → new fixture.

---

### F3. Prompt versioning + A/B framework
[`prompt-version.ts`](../src/features/diagnosis/prompts/prompt-version.ts) already exists. Wire it to a feature flag (Vercel Edge Config or a row in Supabase) so prompt changes can be A/B tested against a small % of traffic before rolling out. Measure: rejection rate, user-reported accuracy ("this was wrong" feedback), contractor booking rate.

---

### F4. Production-error → test loop
This was a punch-list item in the testing-build follow-up too. A scheduled script that pulls the top-N Sentry errors from the diagnosis pipeline + the top-N most-rejected photo characteristics, opens a draft PR with skeleton regression tests and fixture stubs.

---

### F5. Refresh LLM fixtures monthly
The [`scripts/refresh-llm-fixtures.ts`](../scripts/refresh-llm-fixtures.ts) (Phase 7) already exists but is manual. Schedule it monthly via [`refresh-fixtures.yml`](../../.github/workflows/refresh-fixtures.yml). When prompts or models change, fixtures should evolve in lockstep — otherwise tests are pinning yesterday's behaviour.

---

## G. Things that are NOT recommended (but tempting)

- ❌ **Lower the confidence threshold globally.** Users will get more matches but more of them will be wrong. Erodes trust faster than rejections do.
- ❌ **Train a custom vision model.** Way too early. Fix the prompts and the inputs first. Costs are 10–100× the prompt engineering route.
- ❌ **Add a chatbot for clarification.** Multi-turn AI dialogue gets weird fast. Structured clarification questions (the schema you already have) are better.
- ❌ **Show the model's raw thinking to users.** It often hedges in ways that destroy confidence even when the diagnosis is correct.
- ❌ **Automatically retry with a stronger model on rejection.** Cost spike, marginal accuracy gain, harder to debug.

---

## Suggested rollout order

**Week 1 — pure code:**
- A1 (clarification priority) ← biggest single UX win, smallest diff
- A2 (EXIF normalisation)
- A3 (taxonomy keywords)
- A4 (copy on rejection)

**Week 2 — model + prompts:**
- B1 (single-side absent-component fallback)
- D2 (hedging pattern guard)
- E1 (always offer something)

**Week 3 — UX flow:**
- C1 (pre-upload guidance)
- C2 (description-first)
- C3 (per-image primary selection)

**Week 4 — observability:**
- F1 (rejection queue)
- D4 (calibration logging)
- F2 (fixture suite for hard cases)

**Later — heavier lifts:**
- B2 (per-trade schemas)
- B3/B4 (primary_evidence enforcement + observation consistency check)
- D3 (multi-pass for borderline)
- E4 (human-in-the-loop escape hatch)
- F3 (prompt A/B framework)

---

## Reference

- Pipeline call order: [`CLAUDE.md`](../CLAUDE.md#diagnosis-pipeline--call-order)
- Classifier (Agent 2a): [`src/features/diagnosis/agent-classify.ts`](../src/features/diagnosis/agent-classify.ts)
- Prose (Agent 2b): [`src/features/diagnosis/agent-prose.ts`](../src/features/diagnosis/agent-prose.ts)
- Prompts: [`src/features/diagnosis/prompts/`](../src/features/diagnosis/prompts/)
- Orchestrator: [`src/features/diagnosis/processing-orchestrator.ts`](../src/features/diagnosis/processing-orchestrator.ts)
- Trade taxonomy: [`src/lib/services.ts`](../src/lib/services.ts), [`src/lib/diagnosis/diagnosis-trade-taxonomy.ts`](../src/lib/diagnosis/diagnosis-trade-taxonomy.ts)
- Confidence helpers: [`src/lib/diagnosis/structural-confidence.ts`](../src/lib/diagnosis/structural-confidence.ts)
- LLM guard: [`src/lib/ai/llm-content-guard.ts`](../src/lib/ai/llm-content-guard.ts)
- Diagnosis UI: [`src/app/diagnosis/client.tsx`](../src/app/diagnosis/client.tsx)
