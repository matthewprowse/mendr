# Diagnostic Accuracy Hardening Plan

**Author:** Matthew + Claude · **Status:** Proposed · **Last updated:** 2026-05-27

## Why this plan exists

The pipeline architecture is solid. Multi-agent (classify → prose → reasoning sidecar → critique), structured output schemas, taxonomy enforcement, symmetry/cause-hierarchy rules, post-parse rewriters, audit logging — the mechanics work.

**Diagnostic accuracy is not solid.** Real production cases show the underlying model (Gemini 2.5 Flash) lacking SA-specific domain knowledge and equipment-disambiguation discipline. Two recent examples from Matthew's own flat:

1. **Geyser misclassified as water pump.** Same physical equipment classified as "Leaking Water Pump Connection" (`water_pressure_supply` subcategory) in two runs, "Geyser Pipe Connection Leak" (`geyser_fault_plumbing`) in another. User text said *"the geyser's electricity rate has increased… not holding its temperature"* — model ignored the equipment name. Drip-tray water was rusty/brown (textbook corroded-tank signal) — model described it as just "dripping water" with no colour mention. Difference matters: tank corrosion = R10k+ full replacement; fitting leak = R500 tightening.

2. **Garage door downstream symptoms over upstream cause.** A door with a missing left-side counterbalance spring was repeatedly diagnosed as "Detached Lifting Arm" or "Bent Connecting Rod" — both downstream effects of the missing spring. User had to manually correct via refine to get the right diagnosis. (Symmetry + cause-hierarchy prompt rules now mitigate this for the obvious cases, but the pattern of "lead with what's visible, miss the upstream cause" persists for the harder ones.)

The architecture *can* catch these — but only if the model is given the domain-specific knowledge to reason against. Currently every specialist diagnosis is luck plus the LLM's general-knowledge approximation. No domain-trained component exists anywhere in the system.

## Goals

1. **Equipment disambiguation accuracy ≥95%** on user-named equipment. When the homeowner says "geyser" or "DB board" or "gate motor," the trade/subcategory must match — never overridden by the model's visual interpretation.
2. **Every supported subcategory has a failure-mode catalog** with diagnostic cues (visual + verbal signals) and typical repair scope. Catalog is data, queryable and editable, not prose-baked into prompts.
3. **200+ ground-truth eval fixtures** running on a weekly CI sweep. Real-world accuracy becomes a number we track, not a vibe.
4. **No regression** on existing tests. The Architecture Hardening Plan's guarantees still hold.

## Non-goals

- Replacing Gemini 2.5 Flash with a specialist model. Not on the table for cost reasons.
- Adding Brave web search to the diagnosis path. Cost + latency + noise without meaningful gain (see Brave assessment at end).
- Fine-tuning a custom model on SA-specific data. Out of scope until eval suite is built — without ground-truth fixtures we have nothing to fine-tune against.
- Building this plan as a hand-curated per-case patch system. Failure-mode content is structured data, not Bucket-A prompt rules.

## Cost & latency budget

The three bets together add **zero new Gemini calls** to the diagnosis path. They make existing calls smarter by:
- Injecting structured taxonomy + failure-mode data into the prompt (longer prompt, same call count)
- Applying guards in code (zero LLM cost)
- Running eval suite separately from production traffic (cost lives in CI budget, not user-facing)

Expected prompt size growth: +400–600 tokens for the structured taxonomy snapshot. At Gemini Flash input pricing (~$0.075/M tokens), that's **~$0.00005 extra per diagnosis** — negligible.

Expected latency: zero change (same call count, prompt is already small enough).

---

# Phases

The three bets, ordered by impact-per-day-of-work. Phase 1 is the smallest commit with the biggest single-case fix (kills the geyser miss tomorrow). Phase 2 is the multi-week structural improvement. Phase 3 is the ongoing investment that proves any of this is working.

## Phase 1 — Equipment Disambiguation Guard (1–2 days)

**Goal:** When the homeowner names specific equipment in their text, that equipment's trade and subcategory MUST be respected. The model's visual interpretation cannot override it.

### The bug being fixed

Geyser misclassified as water pump despite user text saying "the geyser's electricity rate has increased." The model saw a brass fitting on a cylindrical white object and weighted its visual prior (looks like a pump) over the user's explicit equipment name (geyser).

The existing **USER-IDENTIFIED CAUSE — CONSISTENCY CHECK** prompt rule handles upstream-cause language ("the spring is missing"), but does NOT handle equipment naming ("the geyser is leaking"). Different rule, different fix.

### Design

Three layers of defence:

#### Layer 1: Equipment-name extraction

A new `extractEquipmentMentions(userText: string): EquipmentMention[]` helper that scans user text for SA-residential equipment names and returns matches with their target subcategory_id.

Pattern types:
- **Direct equipment names**: "geyser", "DB board", "gate motor", "garage door", "borehole pump", "pool pump", "irrigation pump", "JoJo tank", "burglar bars", "palisade", "intercom"
- **Specific failure events**: "geyser burst", "spring snapped", "breaker tripped", "drain blocked"
- **SA-specific brand context**: "Kwikot" / "Heatlight" / "Heat-Tech" (all geysers), "Centurion" / "ET" / "DTS" (gate motors), "Hansa" (gate motors)

Each match maps to a target `subcategory_id` from `TAXONOMY_SUBCATEGORIES`. The mapping is a thin lookup table maintained in `src/lib/diagnosis/equipment-mentions.ts`.

Example:
```typescript
extractEquipmentMentions("the geyser's electricity rate has increased")
// → [{ phrase: 'geyser', subcategory_id: 'geyser_fault_plumbing', confidence: 'high' }]

extractEquipmentMentions("Kwikot KE45 is leaking from the top")
// → [{ phrase: 'Kwikot', subcategory_id: 'geyser_fault_plumbing', confidence: 'high', brandHint: 'Kwikot' }]
```

#### Layer 2: Hard reconcile guard in response-builder

In `src/app/api/diagnose/response-builder.ts`, after the existing `reconcileTradeFromDiagnosisSignals` call, add `reconcileEquipmentFromUserMentions`:

```typescript
function reconcileEquipmentFromUserMentions(
    j: Record<string, unknown>,
    userText: string,
    history: HistoryLike[],
): void {
    const mentions = extractEquipmentMentions(userText, history);
    if (mentions.length === 0) return;
    const highConfidence = mentions.filter((m) => m.confidence === 'high');
    if (highConfidence.length === 0) return;
    // The first high-confidence mention is treated as authoritative.
    // (If multiple mentions, the prompt rule should produce a structured_clarification
    // asking the user which equipment they mean — that's a Phase 2 concern.)
    const target = highConfidence[0];
    const currentSubcategory = String(j.subcategory_id ?? '');
    if (currentSubcategory === target.subcategory_id) return;
    // Disagreement detected. Override + log the rewrite for audit.
    logEquipmentReconcileOverride({
        from: currentSubcategory,
        to: target.subcategory_id,
        mention: target.phrase,
        userText: userText.slice(0, 200),
    });
    j.subcategory_id = target.subcategory_id;
    j.trade = lookupTradeForSubcategory(target.subcategory_id);
    // Force a structured_clarification so the user can confirm the override
    // didn't go off the rails — this is the safety net for the case where
    // the user mentioned an equipment in passing but the photo is actually
    // something different.
    j.requires_clarification = true;
}
```

The override is **audit-logged** to `audit_logs.action = 'equipment_reconcile_override'` so we can see (a) how often it fires and (b) whether it's catching real misclassifications or producing false positives.

#### Layer 3: Prompt-level rule (companion to existing USER-IDENTIFIED CAUSE)

A new prompt block in `agent-prose.ts`'s system prompt:

> **USER-NAMED EQUIPMENT — AUTHORITATIVE NAMING RULE**
>
> When the homeowner explicitly names specific equipment in their text or history (e.g. "the geyser is leaking", "our gate motor stopped responding", "the JoJo tank pressure is low"), that equipment is AUTHORITATIVE. Your trade, subcategory_id, and `failed_component` must align with the homeowner's named equipment.
>
> If your visual interpretation conflicts with the user's named equipment:
> - The user's name wins. They live with the equipment; you are looking at a photo.
> - Drop confidence to 70–80 and produce a `structured_clarification` whose h1 hypothesis is the user-named equipment and h2 is your visual interpretation. The user resolves.
>
> This is different from the USER-IDENTIFIED CAUSE rule which handles named *failure causes*. Equipment naming is more authoritative than cause naming.

### Files

- `src/lib/diagnosis/equipment-mentions.ts` (NEW) — extractor + mapping table
- `src/lib/diagnosis/__tests__/equipment-mentions.test.ts` (NEW) — table-driven tests on the extractor
- `src/app/api/diagnose/response-builder.ts` — add `reconcileEquipmentFromUserMentions` call site
- `src/app/api/diagnoses/[id]/refine/route.ts` — same call site for refine path
- `src/features/diagnosis/agent-prose.ts` — add the prompt block
- `src/features/diagnosis/agent-prose.ts` (audit) — add `logEquipmentReconcileOverride` helper

### Verification

1. Add a fixture for the geyser case: user text *"the geyser's electricity rate has increased"* + a stock pump-looking image. Assert: `subcategory_id === 'geyser_fault_plumbing'`, NOT `'water_pressure_supply'`.
2. Run on the three real production rows where the geyser was misclassified. All three must resolve to `geyser_fault_plumbing`.
3. `audit_logs.action = 'equipment_reconcile_override'` row count over 1 day in production should be a small number (not firing on every diagnosis — only when an actual disagreement is detected).

### Expected impact

- Geyser-as-pump miss: eliminated.
- Gate-as-garage / garage-as-gate misses: eliminated when user text names the equipment.
- Pool-pump-as-borehole misses: eliminated.
- No effect on cases where user text doesn't name equipment (most cases) — pure additive guard.

---

## Phase 2 — Per-Subcategory Failure-Mode Catalog (1–2 weeks)

**Goal:** Each taxonomy subcategory carries a structured `failure_modes` array. Each failure mode names its diagnostic cues (visual + verbal) and typical repair scope. The catalog is injected into Agent 2b's prompt at runtime so the model has SA-specific domain reasoning available.

This is the **biggest single accuracy lever**. It's also where the bulk of the work is — populating 30+ subcategories with quality content.

### The bug being fixed

For the geyser case: a corroded tank (rusty drip-tray water + reduced thermal mass + elevated electricity bill) has very specific diagnostic cues that the model doesn't reliably weight. The cues are textbook — they exist in Gemini's training — but the model treats them as one observation among many rather than as a coherent diagnostic pattern.

Solution: name the patterns explicitly per subcategory, with their cues. The model now reasons against a checklist instead of pure pattern-matching.

### Schema

Extend `TaxonomySubcategory` in `src/lib/diagnosis/diagnosis-trade-taxonomy.ts`:

```typescript
export interface TaxonomySubcategory {
    readonly id: string;
    readonly label: string;
    readonly trade: CanonicalTradeLabel;
    readonly scope: string;
    readonly excludes?: readonly string[];
    readonly inferenceAnchors: readonly string[];
    // NEW — Phase 2 of Diagnostic Accuracy Hardening:
    readonly failureModes?: readonly FailureMode[];
}

export interface FailureMode {
    /** Short identifier, kebab-case. Used for logging + audit. */
    readonly id: string;
    /** Plain-language name, suitable for a diagnosis title. */
    readonly label: string;
    /** What's actually happening mechanically/electrically. */
    readonly description: string;
    /**
     * Specific cues that point at this failure mode. Each cue is one
     * observable signal — visual, verbal, or contextual. Cues are
     * accumulating evidence: 2+ cues for the same failure mode strongly
     * indicate it. The model is told to reason against this list, not
     * to apply it as a hard threshold.
     */
    readonly diagnosticCues: readonly DiagnosticCue[];
    /**
     * Typical repair / next steps. Helps the model produce realistic
     * `action_required` and `homeowner_prep`. Indicative only.
     */
    readonly typicalRepair: {
        readonly summary: string;
        /** Indicative cost band in ZAR. Used by reports + clarification UX. */
        readonly costBand: 'minor' | 'medium' | 'major' | 'replacement';
    };
    /**
     * Severity / urgency for safety + scheduling cues in the report.
     */
    readonly urgency: 'now' | 'soon' | 'planned';
}

export type DiagnosticCue =
    | { readonly type: 'visual'; readonly description: string }
    | { readonly type: 'verbal'; readonly description: string }
    | { readonly type: 'contextual'; readonly description: string };
```

### Worked example — `geyser_fault_plumbing`

```typescript
{
    id: 'geyser_fault_plumbing',
    label: 'Geyser Fault / Hot Water Issue',
    trade: 'Plumbing',
    scope: '…existing scope…',
    excludes: [
        'Water pressure issues on cold supply only (→ water_pressure_supply)',
        'Electric tripping caused by geyser element (→ Electrical / db_board_fault if breaker focus)',
    ],
    inferenceAnchors: [
        'geyser', 'hot water', 'no hot water', 'kwikot', 'heat tech', 'heatlight',
        'thermostat', 'element', 'drip tray', 'hot water cylinder', 'tip valve',
    ],
    failureModes: [
        {
            id: 'corroded-tank',
            label: 'Corroded Geyser Tank',
            description: 'The geyser\'s internal sacrificial anode has been consumed and the tank wall is rusting through. Water leaches iron oxide into the tank and drip tray. Usually paired with reduced thermal mass and elevated electricity consumption as the heating element compensates.',
            diagnosticCues: [
                { type: 'visual', description: 'Brown / rusty / murky water in the drip tray below the geyser — not clear.' },
                { type: 'visual', description: 'Visible rust streaks on the geyser body or surrounding pipework.' },
                { type: 'verbal', description: 'Homeowner reports increased electricity usage in recent months.' },
                { type: 'verbal', description: 'Homeowner reports geyser "not holding temperature" or hot water running out faster than before.' },
                { type: 'verbal', description: 'Homeowner reports rust-coloured water from hot tap (any tap fed by the geyser).' },
                { type: 'contextual', description: 'Geyser is 8+ years old (typical anode lifespan exceeded).' },
            ],
            typicalRepair: {
                summary: 'Full geyser replacement. Anode replacement is not viable once tank wall has begun corroding through. Quote includes plumber + electrician + waste removal of old unit.',
                costBand: 'replacement',
            },
            urgency: 'soon',
        },
        {
            id: 'failed-element',
            label: 'Failed Heating Element',
            description: 'The heating element has either burnt out or scaled up. Geyser stops heating water but may not leak. Often pairs with tripping electrics on attempted reset.',
            diagnosticCues: [
                { type: 'verbal', description: 'Homeowner reports no hot water — but no visible leak.' },
                { type: 'verbal', description: 'Homeowner reports the electric tripping when geyser is on.' },
                { type: 'visual', description: 'Scale buildup visible around the element housing.' },
            ],
            typicalRepair: {
                summary: 'Element replacement. Drain geyser, swap element, refill. ~3 hour job.',
                costBand: 'medium',
            },
            urgency: 'soon',
        },
        {
            id: 'failed-thermostat',
            label: 'Failed Thermostat',
            description: 'Thermostat stuck on (overheating, safety valve activation) or stuck off (no heat). Element still works.',
            diagnosticCues: [
                { type: 'verbal', description: 'Homeowner reports water too hot or hot water but at wrong temperature.' },
                { type: 'verbal', description: 'Homeowner reports safety / pressure relief valve discharging.' },
                { type: 'visual', description: 'Tip valve / pressure relief actively dripping.' },
            ],
            typicalRepair: {
                summary: 'Thermostat replacement. ~1 hour job.',
                costBand: 'minor',
            },
            urgency: 'now',
        },
        {
            id: 'fitting-leak',
            label: 'Pipe Fitting Leak at Geyser',
            description: 'Inlet/outlet pipe fitting or shut-off valve has failed. Water drips from a specific external connection — NOT from inside the tank. Geyser itself is intact.',
            diagnosticCues: [
                { type: 'visual', description: 'Water clearly originating from an external pipe fitting, NOT from the body of the geyser.' },
                { type: 'visual', description: 'Drip tray water is CLEAR (not rusty).' },
                { type: 'verbal', description: 'Homeowner reports no change in hot water temperature or electricity usage — only the leak.' },
            ],
            typicalRepair: {
                summary: 'Tighten / replace fitting + new washer. ~30 min job.',
                costBand: 'minor',
            },
            urgency: 'soon',
        },
    ],
}
```

### Runtime injection into the prompt

`src/features/diagnosis/prompts/taxonomy-failure-modes.ts` (NEW) — serialiser that, given a `subcategory_id`, produces a compact prompt block:

```
KNOWN FAILURE MODES FOR THIS SUBCATEGORY (use to reason against the visible evidence and user text — do NOT name a failure mode that none of the cues match):

[corroded-tank]  Corroded Geyser Tank
  Description: sacrificial anode consumed; tank wall rusting through.
  Cues:
    - VISUAL: brown / rusty / murky water in the drip tray
    - VISUAL: rust streaks on geyser body or pipework
    - VERBAL: homeowner reports increased electricity usage
    - VERBAL: homeowner reports geyser not holding temperature
    - CONTEXTUAL: geyser is 8+ years old
  Typical repair: replacement.
  Urgency: soon.

[failed-element]  Failed Heating Element
  …

When ≥2 cues for one failure mode match what you see + what the user said, name that failure mode in the diagnosis title and `failed_component`. When NO failure mode's cues match, fall back to "Unknown fault — site visit required" and produce a structured_clarification asking targeted questions per failure mode.
```

This block is injected into Agent 2b's system prompt at runtime, between the existing CLASSIFICATION block and the USER-IDENTIFIED CAUSE block. Only the subcategory's own failure modes are injected — not all 30+ subcategories' — to keep the prompt focused.

### Sibling subcategory hints

When the user's text could plausibly fit two sibling subcategories (e.g. `geyser_fault_plumbing` vs `water_pressure_supply`), inject the sibling's top 2 failure modes as well — labelled as **alternatives the model should consider**. This is the cross-subcategory disambiguation that Phase 1's guard handles for *named* equipment; Phase 2's catalog handles it for *symptom*-only descriptions.

### The 30+ subcategories — content authoring plan

This is the bulk of the work. Each subcategory needs 3–6 failure modes with quality cues. Rough breakdown:

| Trade | Subcategories | Total failure modes | Auth difficulty |
|---|---|---|---|
| Plumbing | 8 (geyser, leaks, blockage, pressure, fittings, drainage, hot-water, sewerage) | ~30 | Medium — well-documented domain |
| Electrical | 6 (DB board, sockets, lighting, wiring, sub-distribution, faults) | ~25 | Hard — wide failure space, safety-critical |
| Security | 5 (gate motor, garage door, intercom, access control, perimeter) | ~20 | Medium — Centurion / ET docs available |
| Pool | 4 (pump, filter, chemistry, structural) | ~15 | Easy — well-bounded |
| Building | 5 (damp, structural, finishes, renovation, foundation) | ~20 | Hard — visual diagnosis difficult |
| Painting / Carpentry / Flooring | 6 | ~20 | Easy — visual + low-stakes |
| **Total** | **~30 subcategories** | **~130 failure modes** | |

**Content sourcing strategy:**

1. **Bootstrap from contractor interviews.** 30-minute calls with 3 contractors per trade. Standard questions: "What are the 5 most common faults you see? For each, what does the homeowner usually report? What do you check first when you arrive?" Notes → failure mode entries.
2. **Pull from SABS / manufacturer docs** for safety-critical items (electrical, gas geysers).
3. **Use Gemini Pro 1.5 to draft initial catalogs** from a prompt like *"For [subcategory] in South African residential context, list 5 most common failure modes with diagnostic cues."* — but EVERY draft is reviewed by a contractor before shipping. AI-drafted unreviewed content is forbidden by Principle 1 of the Architecture Hardening Plan (no per-case patches without verification).
4. **Backfill from production critique data** (Agent 3) once `DIAGNOSIS_AGENT_3_ENABLED=1` accumulates enough rows. The critique's `failure_mode` and `notes_for_human_review` fields surface patterns we missed.

### Files

- `src/lib/diagnosis/diagnosis-trade-taxonomy.ts` — extend the type + populate
- `src/features/diagnosis/prompts/taxonomy-failure-modes.ts` (NEW) — runtime serialiser
- `src/features/diagnosis/agent-prose.ts` — inject into system prompt
- `src/lib/diagnosis/__tests__/taxonomy-failure-modes.test.ts` (NEW) — invariant tests (every subcategory has ≥3 failure modes, no duplicate IDs, cue types valid)
- `docs/failure-mode-content-status.md` (NEW) — tracking sheet for which subcategories have contractor-verified content

### Verification

1. Eval suite (Phase 3) must show the geyser case correctly diagnoses as `corroded-tank` failure mode (not `fitting-leak`) when the visual + verbal cues both point at corrosion.
2. No regression on already-passing eval fixtures.
3. Prompt size stays under 6000 tokens (rough cap to maintain latency budget).

### Expected impact

The biggest single accuracy lever. Estimated to lift correct-failure-mode rate from ~40% (current vibe-based estimate) to ~75–85% on cases where ≥2 cues are present. Cases with 0–1 cues still need clarification.

---

## Phase 3 — Ground-Truth Eval Suite (ongoing, 2–3 weeks initial build)

**Goal:** Real diagnostic accuracy becomes a measured number, not a vibe. 200+ ground-truth fixtures, weekly automated runs, regression baselines locked in CI.

Without this, Phases 1 and 2 are guesses. With it, we know exactly which subcategory-failure-mode combinations the system handles and which it flunks — and we can iterate.

### What a fixture looks like

Each fixture is a JSON file in `src/__tests__/diagnostic-accuracy/fixtures/` with:

```typescript
interface AccuracyFixture {
    id: string;                     // 'plumbing-geyser-corroded-tank-01'
    case_summary: string;           // 1-line description for humans
    ground_truth: {
        trade: string;
        subcategory_id: string;
        failure_mode_id: string;    // matches a failureModes[].id in taxonomy
        confidence_floor: number;   // minimum confidence the system should reach
        source: string;             // contractor verification: 'verified-2026-05-27-john-plumbing-co'
    };
    inputs: {
        image_urls?: string[];      // images stored in test fixtures bucket
        user_text?: string;
        user_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
    optional_assertions: {
        cascading_damage_mentions?: string[];
        homeowner_prep_includes?: string;
        urgency?: 'now' | 'soon' | 'planned';
        cost_band?: 'minor' | 'medium' | 'major' | 'replacement';
    };
    notes_for_reviewer: string;     // why this case is interesting
}
```

200+ fixtures across the 30+ subcategories. Distribution target:

- **Happy paths (60 fixtures)**: textbook clear cases — multiple cues, no ambiguity. System must get these.
- **Single-cue cases (50 fixtures)**: one strong cue, model has to reason. Tests Phase 2's catalog.
- **Sibling-subcategory ambiguity (30 fixtures)**: geyser-vs-pump, gate-vs-garage, pool-vs-borehole. Tests Phase 1's guard + Phase 2's sibling hints.
- **Contradictory cases (20 fixtures)**: photo says X, user says Y. Tests USER-NAMED EQUIPMENT rule + USER-IDENTIFIED CAUSE rule.
- **Genuine clarification cases (20 fixtures)**: model should produce `structured_clarification`, not commit. Tests cause-hierarchy rule.
- **Out-of-scope cases (20 fixtures)**: random photos, off-platform service requests. Tests rejection.

### Where the fixtures come from

1. **Real production diagnoses** (with PII scrubbed) — pull rows from `diagnoses` table where a contractor has confirmed the outcome (via the existing `job_outcomes` table). 30+ rows already exist.
2. **Synthetic / posed cases** — author cases for known failure modes with the photos taken on phone walk-throughs. Cheaper than waiting for organic production data.
3. **Contractor demo cases** — when interviewing contractors for Phase 2 content, ask them to photograph and describe 5–10 typical jobs they've completed. These become both content and fixtures.

### The runner

`src/__tests__/diagnostic-accuracy/runner.test.ts` — Vitest suite that:

1. Loads each fixture.
2. Runs `runClassification` + `runProseGeneration` (the real pipeline, not mocked) against the fixture inputs.
3. Asserts:
   - `subcategory_id` matches `ground_truth.subcategory_id` (hard fail)
   - `failure_mode_id` (newly extracted) matches `ground_truth.failure_mode_id` (hard fail)
   - `confidence` ≥ `ground_truth.confidence_floor` (soft fail / warning)
   - Optional assertions pass (warnings, not hard fails)
4. Records pass/fail/warning per fixture in `tmp/diagnostic-accuracy/<timestamp>.json`.
5. Compares against the locked baseline. Net regressions fail CI.

### Cost & cadence

Running 200 fixtures against real Gemini = 200 × (Agent 2a + Agent 2b) calls = 400 Gemini Flash calls = ~$0.16 per full sweep. Trivial.

Cadence:
- **Per-PR**: run the 30 high-priority "happy path" fixtures. Fast (~2 min), no PR can ship if it regresses these.
- **Nightly CI**: run the full 200+ sweep. Email summary. Trends graphed.
- **Manual**: any contractor or product team member can trigger a sweep via `npm run eval:diagnostic-accuracy`.

### Regression baseline lock

`src/__tests__/diagnostic-accuracy/baseline.json` — locked snapshot of which fixtures pass. CI fails if a previously-passing fixture fails. New fixtures default to "expected to fail" and are added to the baseline once they pass.

This is the **ratchet** — fixtures only ever pass; once added, they cannot regress without explicit acknowledgement.

### Contractor feedback loop

The `job_outcomes` table already exists with `outcome: 'job_done' | 'still_open' | 'used_different' | 'contractor_reply'`. Extend to capture **diagnostic accuracy**: did the AI's predicted failure mode match what was found on-site?

New field: `actual_failure_mode_id`. New optional field: `actual_subcategory_id` (when the AI was even wrong on subcategory). When the contractor reports a mismatch, the row becomes a **candidate fixture** — flagged in the admin dashboard for the product team to convert into a regression fixture with anonymised photos + user text.

This makes the eval suite self-extending. Every contractor disagreement becomes a learning case.

### Files

- `src/__tests__/diagnostic-accuracy/runner.test.ts` (NEW) — the runner
- `src/__tests__/diagnostic-accuracy/fixtures/*.json` (NEW) — 200+ fixture files (organised by trade/subcategory)
- `src/__tests__/diagnostic-accuracy/baseline.json` (NEW) — locked passing set
- `src/__tests__/diagnostic-accuracy/fixture-builder.ts` (NEW) — CLI helper to convert a production row into a fixture
- `supabase/migrations/YYYYMMDDHHMMSS_add_actual_failure_mode.sql` — extend `job_outcomes`
- `package.json` — add `eval:diagnostic-accuracy` script

### Verification

The eval suite IS the verification. Initial pass rate target:

- Phase 1 alone shipped: 60% of disambiguation fixtures should pass
- Phase 1 + Phase 2 shipped (full failure-mode catalog): 80%+ of all fixtures
- Phase 3 maturity (12 weeks post-launch with contractor feedback): 90%+

### Expected impact

This is what makes everything else measurable. Without it, we cannot tell if Phase 2's content authoring is actually helping or just adding noise. With it, every prompt change is gated on aggregate fixture performance.

---

## Brave search assessment — recommendation: NOT adding to diagnosis path

Detailed reasoning so this decision is documented:

**What Brave search would theoretically add:**
- Real-time information about specific equipment models, recalls, firmware updates
- Pricing context for specific brand parts
- Niche failure-mode documentation

**Why it doesn't help diagnostic accuracy:**

1. **Missing-knowledge isn't the bug.** Gemini 2.5 Flash already knows that rusty geyser water indicates tank corrosion. The model's training data covers SA-residential maintenance domain at general-knowledge depth. The misses we observe are not "model didn't know X" — they're "model didn't weight X correctly given the photo." A web search returning the same fact in different phrasing doesn't change weighting; structured taxonomy injection (Phase 2) does.

2. **Brave's index is US/UK-weighted for home maintenance.** SA-specific content is sparse. *"Geyser leak diagnosis"* returns American HVAC blogs about water heaters — different brands, different mounting conventions, different failure-mode prevalences. Adding non-SA context to the prompt could make accuracy worse, not better.

3. **Cost / latency penalty is real.** Brave at ~$3/1000 calls would 8x diagnose unit cost. Latency adds 1–3s on top of an 8–15s pipeline. UX gets worse for accuracy gain that doesn't materialise in any test we can run.

4. **Non-determinism is a problem.** Search results change over time. The same photo diagnosed twice could give different answers because Brave's top result shifted. We'd lose the ability to lock baselines (Phase 3) which kills the eval suite.

**Where Brave COULD help (separate flows, not diagnosis):**

- **Provider/contractor enrichment.** Already used elsewhere in the app — that's fine.
- **Specific brand-recall lookups.** When the user text mentions a specific brand+model AND there's a known recall, Brave could surface it. But this is a niche Phase 13 stretch optimisation, not core diagnosis. Requires the user to type the model number, which they rarely do.
- **Cost calibration for the report page.** Pulling current SA contractor pricing for replacement components. But `cost-estimates.ts` already has structured data; Brave doesn't add precision here.

**Recommendation:** Do not add Brave to `/api/diagnose` or `/api/diagnoses/[id]/refine`. Revisit only if Phase 3 eval data shows a specific class of failures that is provably caused by missing real-time information (e.g. a brand recall affecting accuracy). To date, no such failure mode is documented.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Equipment-mention extractor produces false positives (e.g. user mentions "gate" but means "garden gate, not gate motor") | Confidence levels on each mention; only `high` confidence triggers override; audit logs let us tune the patterns |
| Failure-mode content is AI-drafted and wrong | Contractor verification gate before any failure mode ships — owned by Matthew + product team |
| 200 fixtures is too few to be statistically meaningful | True for any individual subcategory; the ratchet model (only pass, never regress) makes it useful even at low fixture count per subcategory |
| Contractor feedback loop is low-volume early | Synthetic fixtures + production-row conversion fill the gap until volume builds |
| Adding failure-mode content to the prompt bloats it beyond Gemini context | Per-call we only inject the relevant subcategory + sibling top-2. Capped ~600 tokens. Plenty of headroom. |
| Phase 2 takes longer than 2 weeks because contractor scheduling is slow | Bootstrap with Gemini Pro drafts that are immediately marked "unverified" in `failure-mode-content-status.md`. Verified content overwrites drafts on a rolling basis. |

## Success Criteria

By end of Phase 3 (~12 weeks total):

1. **Equipment-disambiguation accuracy ≥95%** on the 50 fixtures with user-named equipment. (Phase 1 outcome.)
2. **Failure-mode correctness ≥80%** across all 200+ fixtures. (Phase 2 outcome.)
3. **Zero net regressions** ever shipped after Phase 3 lock. CI gates this. (Phase 3 outcome.)
4. **Contractor feedback loop running**: ≥10 fixtures per month being generated from contractor disagreements. (Phase 3 outcome.)
5. **The geyser case** (the inciting incident for this plan) correctly diagnoses as `corroded-tank` failure mode on first pass with no user clarification needed. (Specific.)

## Execution order

Phase 1 → 2 → 3 in that order, but with overlap:
- **Week 1**: ship Phase 1 (equipment guard). Start Phase 2 schema + first 3 subcategories.
- **Week 2–3**: Phase 2 content authoring (contractor interviews + drafts).
- **Week 4–5**: Phase 2 prompt injection live. First 100 Phase 3 fixtures landed.
- **Week 6–7**: Phase 3 full runner + baseline lock. CI gating live.
- **Week 8+**: Phase 2 content rolls in trade-by-trade as contractor verification completes. Phase 3 fixtures grow from contractor feedback loop.

Estimated total effort: **6–8 weeks engineering + ongoing contractor coordination**.

## Open Questions

1. **Contractor compensation.** Reviewing 5–10 failure modes per call costs a contractor 30 minutes. Pay them? In-kind credit for the platform? Recognition on the product page?
2. **Pre-launch vs post-launch.** Should this plan be a launch blocker, or ship the product with current accuracy + a "diagnostic aid, not final word" framing while this plan executes in background?
3. **Failure-mode catalog visibility on the report page.** Once a failure mode is identified, should the report explain to the user *why* (cue-by-cue), or stay at the current narrative level? The data is there; it's a UX question.
4. **Job_outcomes UX.** Currently contractors have a single rating + outcome field. The Phase 3 feedback loop needs a "did the AI's diagnosis match?" question. Where in the flow does that fit?

---

## Closing principle

The pipeline is launch-ready. The accuracy is the problem. These three bets convert "AI diagnosis" from a probabilistic guess into a measurable, contractor-verifiable system.

Brave search does not help. Per-subcategory structured domain knowledge + an equipment-naming guard + a real eval suite do help. Build those.
