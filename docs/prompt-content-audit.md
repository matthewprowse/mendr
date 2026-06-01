# Prompt Content Audit — 2026-05

**Phase:** 1 (Prompt Forensics & Audit)
**Source plan:** [Diagnosis-Architecture-Hardening-Plan.md](./Diagnosis-Architecture-Hardening-Plan.md) §Phase 1 task 1.
**Methodology:** read each prompt file line-by-line; record every line that names a trade, component, brand, fault, or scenario; classify per the plan's three-bucket framework.

## Buckets, briefly

- **A — per-case patch.** Tunes behaviour for a specific diagnosis or fault scenario. Names a component, brand, or symptom that only fires for that case. Verdict: **delete**.
- **B — trade taxonomy content.** Domain knowledge about trade scopes, subcategory boundaries, disambiguation pairs, supported services. Verdict: **migrate** to `src/lib/diagnosis/diagnosis-trade-taxonomy.ts` (extending `scope`, `excludes`, `inferenceAnchors`).
- **C — general diagnostic principle with trade-named example.** Reasoning rule that is correct in general, currently illustrated with a specific worked example. Verdict: **rephrase** to remove the trade-named example — the taxonomy provides the equipment; the principle does the reasoning.

## Coverage

Audited files:
- `src/features/diagnosis/prompts/base.ts`
- `src/features/diagnosis/prompts/output-format.ts`
- `src/features/diagnosis/prompts/special-cases.ts`
- `src/features/diagnosis/prompts/followup.ts`
- `src/features/diagnosis/prompts/validation.ts`
- `src/features/diagnosis/prompts/composer.ts`
- `src/features/diagnosis/prompts/providers.ts`
- `src/features/diagnosis/prompts/provider-hydration.ts`
- `src/features/diagnosis/prompts/user-turn.ts`
- `src/features/diagnosis/agent-classify.ts` (system prompt embedded in code)
- `src/features/diagnosis/agent-prose.ts` (chip rules + visual anchoring embedded in code)

## The audit table

| # | File:Line | Quote (trimmed) | Bucket | Verdict & target |
|---|---|---|---|---|
| 1 | [base.ts:5](../src/features/diagnosis/prompts/base.ts) | `If they correct equipment type (e.g. borehole pump vs pool pump, irrigation vs pool, gate vs garage), replace diagnosis and trade to match` | **C** | Rephrase: keep the general "user correction overrides taxonomy match" principle; remove the parenthetical examples. The taxonomy's `excludes` already names borehole↔pool, gate↔garage as boundary pairs. |
| 2 | [base.ts:9](../src/features/diagnosis/prompts/base.ts) | `If the user explicitly corrects or clarifies a DIFFERENT issue (e.g. "Actually it's a garage door", "No, it's plumbing", "I meant gate repair")` | **C** | Rephrase: drop the worked-example list; the principle "explicit user statement overrides initial card selection" is fine on its own. |
| 3 | [base.ts:20](../src/features/diagnosis/prompts/base.ts) | `USER CORRECTIONS BEAT THE PHOTO: ... similar-looking pumps, motors, or pipes: pool vs borehole vs irrigation, gate vs garage door motor, etc.` | **C** | Rephrase: principle stays; trade-pair list deleted. Taxonomy carries the disambiguations. |
| 4 | [base.ts:20](../src/features/diagnosis/prompts/base.ts) | `Never output "pool" or "Pool Maintenance" if the user said it is not a pool system.` | **A** | Delete. This is a per-case patch — a specific trade name with a specific override. Generalises to "do not output a trade label the user has explicitly negated", which is already implicit in the user-corrections principle. |
| 5 | [base.ts:23](../src/features/diagnosis/prompts/base.ts) | `Be PROACTIVE: When you can clearly identify the equipment (gate motor, water pump, circuit breaker, etc.), give a FULL diagnosis immediately.` | **C** | Rephrase: keep "diagnose immediately when equipment is clearly identifiable"; drop the example list. The taxonomy gives the model the equipment universe. |
| 6 | [base.ts:24](../src/features/diagnosis/prompts/base.ts) | `ESTIMATED DIAGNOSIS: Always provide a specific estimated diagnosis ... Examples: "Burnt capacitor in gate motor", "Geyser thermostat failure", "Blocked drain with tree roots"` | **A** | Delete. The principle "the diagnosis title must name a specific failed component or condition, not a service category" stays as Bucket C with no examples. The examples bias the model toward those exact phrasings. |
| 7 | [base.ts:24](../src/features/diagnosis/prompts/base.ts) | `Never use vague labels like "Electrical Issue" or "Plumbing Problem".` | **C** | Rephrase: keep "never use a trade-label-as-diagnosis". The trade names cited here are illustrative of the anti-pattern, but the rule is general. |
| 8 | [base.ts:26](../src/features/diagnosis/prompts/base.ts) | `FOLLOW-UP QUESTIONS: ... Examples: "Is the motor running but the gate not moving?" / "Is there hot water at all, or just not enough?" / "Does the circuit trip immediately?"` | **A** | Delete the worked examples. They bias future clarification phrasing toward these three exact patterns. The principle "ask targeted follow-ups when you can identify the equipment but not the fault" is sufficient on its own. |
| 9 | [base.ts:27](../src/features/diagnosis/prompts/base.ts) | `EXTENT OF DAMAGE & USER'S STATED NEED: ... e.g. whole kitchen destroyed, structural damage ... "Kitchen renovation", "Building contractor"` | **B + C** | Migrate the "extensive damage routes to rebuild trade" pairs to the taxonomy as new subcategory `scope` extensions on Building & Construction (rebuild scope). Keep the general principle "extent of damage may shift the correct trade from a repair to a rebuild" as Bucket C. |
| 10 | [output-format.ts:34](../src/features/diagnosis/prompts/output-format.ts) | `Examples: "Geyser thermostats fail when scale builds up ..." or "Garage door torsion springs fatigue from repeated cycles ..."` | **A** | Delete both worked examples. They prime the model to use these exact mechanisms when the trade matches. The principle "explain the causal mechanism in paragraph 2" stays. |
| 11 | [output-format.ts:68](../src/features/diagnosis/prompts/output-format.ts) | `"trade": "Exactly one of: Electrical, Plumbing, Security, Building & Construction, Carpentry & Woodwork, Flooring & Tiling, General Handyman, Locksmith Services, Painting, Pool Maintenance, Rubble & Waste Removal, Welding."` | **B** | Migrate: the canonical trade list MUST come from the taxonomy at runtime, not from a hard-coded string in the output schema. Already present in `lib/services` — replace with a runtime-generated enum list assembled by `composer.ts`. |
| 12 | [output-format.ts:72](../src/features/diagnosis/prompts/output-format.ts) | `"clarification_questions": [...] (e.g. 'It\'s a gas geyser')` | **A** | Delete the worked example. Phase 5's prompt schema replaces this with the discriminating-chip rubric from Agent 2c. |
| 13 | [output-format.ts:82](../src/features/diagnosis/prompts/output-format.ts) | `"confidence" must be an integer 0–100. It measures match between the photo and your label — NOT stubborn certainty after the user has corrected you. If the user says the equipment or context is different from what the image suggests, cap confidence at 75 unless a new image confirms it.` | **C** | Rephrase: this conflates two things (rubric definition + capping rule for user-correction). Phase 4 facet-confidence schema replaces the integer; the cap rule becomes a structured rule in the new rubric, not a single sentence. |
| 14 | [special-cases.ts:1](../src/features/diagnosis/prompts/special-cases.ts) | `UNRELATED IMAGE RULE: If the image is unrelated (selfies, landscapes, memes, food, pets, documents, vehicles) AND the user has NOT stated a clear service need in text, reject it.` | **C** | Rephrase: the general principle ("when neither the image nor the text expresses a home-maintenance need, set rejected=true") stays. The (selfies, landscapes, memes, food, pets, documents, vehicles) list is illustrative — keep as a short category list or drop entirely; do NOT migrate as data (these aren't trades). |
| 15 | [special-cases.ts:5](../src/features/diagnosis/prompts/special-cases.ts) | `UNSUPPORTED HOME SERVICE RULE: When the issue is home-related but the requested work is not in our supported service categories, set "unserviced" to true ...` | **B** | Migrate: "supported service categories" is exactly the taxonomy — this rule belongs as a pre-classification check (does any subcategory `scope` cover the request?) computed in `lib/diagnosis/`, not in prompts. Plan §Phase 5 calls this out explicitly: special-cases.ts is deleted, this content moves to a code-level guard. |
| 16 | [followup.ts:8](../src/features/diagnosis/prompts/followup.ts) | `FOLLOW-UP MESSAGES: When there is already a diagnosis, preserve it unless the user explicitly corrects it.` | **C** | Keep. Already a general principle with no embedded examples — only adjustment needed is to align with Phase 4 facet schema. |
| 17 | [followup.ts:17](../src/features/diagnosis/prompts/followup.ts) | `"actually it's X", "it's a garage door", "I need gate repair", "it's a borehole pump not a pool pump"` | **C** | Rephrase: drop the worked-example list. The principle "discard previous diagnosis/trade when user provides conflicting new substantive information" is sufficient. |
| 18 | [followup.ts:21](../src/features/diagnosis/prompts/followup.ts) | `If confidence < ${minConf} on any change: set requires_clarification: true ...` | **C** | Rephrase: replace with Phase 4 facet-confidence + Phase 6 recommended_action logic. The current integer-threshold rule disappears. |
| 19 | [followup.ts:23](../src/features/diagnosis/prompts/followup.ts) | `If the current diagnosis is still vague (e.g. "Plumbing", "Electrical"): ask a targeted follow-up ... "Is it a leak, no hot water, or a blockage?"` | **A** | Delete. The "is it a leak/no-hot-water/blockage?" worked example is per-case prose. The vague-label anti-pattern is already covered by row 7. |
| 20 | [followup.ts:51-55](../src/features/diagnosis/prompts/followup.ts) | `For garage/door issues: "Is it the door itself, the motor/opener, the remote, or the tracks ..." / For plumbing: ... / For electrical: ...` | **A** | Delete. These are three explicit per-trade clarification templates inside the diagnosis-rejected branch. The general principle ("ask 2-3 concrete options based on what you saw") is the keeper; the trade-typed templates are exactly what Principle 1 forbids. |
| 21 | [validation.ts:8](../src/features/diagnosis/prompts/validation.ts) | `This app covers home maintenance and repairs only: plumbers, electricians, builders, carpenters, tilers, painters, locksmiths, handymen, security & access specialists, pool maintenance, rubble removal, and welders.` | **B** | Migrate: the supported-trades list belongs in `lib/services` / taxonomy; the prompt should reference it at runtime, not duplicate. Already partially present in `serviceListText` injected into validation prompt at line 14 — but the duplication at line 8 is the bug. |
| 22 | [validation.ts:9](../src/features/diagnosis/prompts/validation.ts) | `We do NOT offer domestic workers, cleaners, gardeners, or any household staffing services.` | **B** | Migrate: the "what we don't do" list is the inverse of the taxonomy. Either captured as a top-level `EXCLUDED_SERVICES` constant in `lib/services`, or implicit (anything not in the taxonomy is unserviced). Currently duplicated in prose. |
| 23 | [validation.ts:10](../src/features/diagnosis/prompts/validation.ts) | `EXPLICIT SERVICE REQUESTS (highest priority): ... "I need an electrician", "find me a plumber", "I want a painter"` | **C** | Rephrase: drop the three worked examples; the principle is "explicit service requests for any supported trade are honoured unconditionally." |
| 24 | [validation.ts:13](../src/features/diagnosis/prompts/validation.ts) | `Use requires_clarification when: ... (e.g. you see a geyser but don't know if it's no hot water, leak, or pressure issue)` | **A** | Delete the worked example. The principle is fine. |
| 25 | [validation.ts:15](../src/features/diagnosis/prompts/validation.ts) | `TRADE DETAIL (SPECIALTY SUB-HEADING): ... e.g. Borehole Drilling, Automated Gate Motor, Kitchen Renovation` | **A** | Delete the worked examples. The principle "trade_detail names the specialty within the chosen trade" stays. |
| 26 | [validation.ts:17](../src/features/diagnosis/prompts/validation.ts) | `CONFIDENCE: Use 85%+ confidence and recommend providers ONLY when ...` | **C** | Rephrase: Phase 4 facet schema removes the integer threshold; this becomes part of the new rubric. |
| 27 | [agent-classify.ts:96](../src/features/diagnosis/agent-classify.ts) | Field description: `"torsion spring", "thermostat", "pressure relief valve", "PCB board", "stop valve"` | **A** | Delete the worked examples in the field description. The principle "name the specific component that failed" stays. |
| 28 | [agent-classify.ts:101](../src/features/diagnosis/agent-classify.ts) | Field description: `"bent connecting rod from spring loss", "warped frame from sustained leak", "tripped earth leakage from short to chassis"` | **A** | Delete the worked examples. The principle "name the cascading damage" stays. |
| 29 | [agent-classify.ts:189](../src/features/diagnosis/agent-classify.ts) | `Gate motor (boundary post, driveway gate) vs garage door motor (ceiling track, overhead door) — these are distinct subcategory_ids.` | **B** | Migrate: this disambiguation pair is already in the taxonomy (`gate_motor_fault.excludes` includes garage doors). The prompt should reference the taxonomy, not duplicate the pair. |
| 30 | [agent-classify.ts:191](../src/features/diagnosis/agent-classify.ts) | `USER CORRECTIONS BEAT THE PHOTO: ... "it's a borehole pump not a pool pump", "this is a gate motor", "I need a plumber"` | **C** | Rephrase: drop the worked-example list (duplicates row 3). One general statement of the principle remains. |
| 31 | [agent-classify.ts:351-359](../src/features/diagnosis/agent-classify.ts) | Pinned fixture mock data with `subcategory_id: 'geyser_fault'` | — | Not a prompt content issue — this is test/mock-fallback code. Out of scope for the prompt audit but the fixture id `geyser_fault` doesn't exist in the live taxonomy (it's `geyser_fault_plumbing` / `geyser_electrical`). Flag separately as a code-correctness item. |
| 32 | [agent-prose.ts:103](../src/features/diagnosis/agent-prose.ts) | Field description: `for example: switch the geyser circuit breaker off at the DB board, isolate the water supply at the mains, clear access to the distribution board, note the error code shown on the display` | **A** | Delete the worked examples. The principle "name the single most practical pre-contractor action" stays. |
| 33 | [agent-prose.ts:122](../src/features/diagnosis/agent-prose.ts) | Field description: `Bad: "a garage door". Good: "left torsion spring is missing from its bracket; the right one is intact and seated correctly".` | **C** | Rephrase: keep the bad/good contrast pattern; drop the trade-named subject. Could be rewritten as `Bad: "the equipment". Good: "the specific component, its position, its condition, and any visible damage or absence".` |
| 34 | [agent-prose.ts:128](../src/features/diagnosis/agent-prose.ts) | Field description: `"right torsion spring", "ceiling-mounted rail", "DB board main breaker", "pressure relief valve"` | **A** | Delete the worked examples. The principle "name specific components visible in the image" stays. |
| 35 | [agent-prose.ts:134](../src/features/diagnosis/agent-prose.ts) | Field description: `"left torsion spring (absent, only bracket remains)", "connecting rod (bent at midpoint)", "thermostat housing (scorched on lower edge)"` | **A** | Delete the worked examples. The principle "name damaged/missing components with their nature of damage" stays. |
| 36 | [agent-prose.ts:165](../src/features/diagnosis/agent-prose.ts) | Field description: `"With the motor disengaged, lift the door by hand; if it stays balanced halfway up the spring tension is fine."` and `"Place a dry sheet of paper under the joint overnight; a wet patch confirms an active leak."` | **A** | Delete the worked examples. The diy_verification principle stays. These examples are particularly insidious — they tie diy_verification phrasing to garage-door and leak scenarios specifically. |
| 37 | [agent-prose.ts:170](../src/features/diagnosis/agent-prose.ts) | Field description: `"A photo of the underside of the geyser showing the pressure relief valve and any drip tray would let me confirm whether the leak is from the valve or the tank."` | **A** | Delete the worked example. The photo_request principle stays. |
| 38 | [agent-prose.ts:180](../src/features/diagnosis/agent-prose.ts) | Field description: `"Clear view of broken spring bracket", "Photo angle obscures opposite side", "Description matches the visible damage", "No image of the affected area"` | **A** | Delete the worked examples for confidence_drivers. The principle "list 2-4 short observations that drove confidence — supporting and limiting" stays. |
| 39 | [agent-prose.ts:237](../src/features/diagnosis/agent-prose.ts) | Chip examples: `"It started after heavy rain.", "The breaker trips when this runs.", "It only happens in one room.", "Something else is happening."` | **A** | Delete the worked examples (except the catch-all). The chip rules already describe the constraints; concrete examples bias chip phrasing toward these exact patterns. |
| 40 | [agent-prose.ts:443-463](../src/features/diagnosis/agent-prose.ts) | MOCK_LLM fallback diagnosis hard-coded to geyser pressure relief valve fault. | — | Not a prompt issue — this is the mock-LLM stub for tests. Out of scope. |
| 41 | [providers.ts:31](../src/features/diagnosis/prompts/providers.ts) | `If the user asks "why is X not your pick?", "why did you pick Y?"` | **C** | Rephrase: principle stays ("answer pick-rationale questions directly using the [SCANDIO'S PICK] Reason"); examples are placeholder variables, not trade-named — borderline keep. |
| 42 | [user-turn.ts:81](../src/features/diagnosis/prompts/user-turn.ts) | `(e.g. a torsion spring bracket missing on one side, a cable hanging loose, a roller off its track)` | **A** | Delete the worked examples. The principle "absence detection — a component present on one side and absent on the other is the primary fault signal" stays. |
| 43 | [user-turn.ts:81](../src/features/diagnosis/prompts/user-turn.ts) | `(e.g. "lift spring absent from bracket")` | **A** | Delete the worked example. Principle stays. |
| 44 | [user-turn.ts:97](../src/features/diagnosis/prompts/user-turn.ts) | `(e.g. gate motor, geyser, DB board) — diagnose it and recommend providers` | **C** | Rephrase: drop the trio of trade-named examples; "do NOT ask for clarification when the equipment is recognisable" is the principle. |

## Bucket counts

| Bucket | Count | Verdict |
|---:|---:|---|
| A — per-case patches | 19 | **DELETE** |
| B — taxonomy content | 5 | **MIGRATE** to `diagnosis-trade-taxonomy.ts` / `lib/services` |
| C — general principle with trade examples | 14 | **REPHRASE** (drop the embedded examples) |
| Mixed B + C | 1 | Migrate the taxonomy half (B); rephrase the principle half (C) |
| Out of scope (mock/test code) | 2 | — |
| Borderline | 1 | Decide during Phase 5 rewrite |

**Total prompt-content findings: 41 in-scope items.**

The 19 Bucket A items are the most damning. The plan's principle 1 forbids them in production code — and we have 19 of them. Each was likely added in response to a specific case going wrong, and each now biases the model away from cases it hasn't seen.

## Likely incident provenance

A handful of Bucket A items map cleanly to past incidents (best-effort guesses based on git blame would confirm; not run here to avoid noise — Phase 1's task description says "if knowable from git blame" and recommends not blocking on it):

- Row 4 (`Never output "pool" or "Pool Maintenance" if the user said it is not a pool system`) — likely a specific user complaint about pool-routing for a non-pool case.
- Row 8 (the three follow-up question worked examples) — three separate clarification-quality incidents resulting in template lock-in.
- Row 20 (the per-trade clarification templates in `diagnosisRejectedPrompt`) — three separate "the user rejected the diagnosis and we asked a bad question" incidents.
- Rows 35-37 (the geyser/torsion-spring worked examples in agent-prose field descriptions) — likely a single round of prompt tuning during the v7.x prose-richness work; the comments around line 28 in `user-turn.ts` reference a "2026-05-23 gate-spring incident".

The pattern is consistent with the plan's diagnosis: prompts have been used as a per-case fix vector instead of an engineered structural document.

## Migration target map (for Phase 5 work)

The 5 Bucket B items and the B-half of the mixed row will absorb into the taxonomy as follows:

| Audit row | Migration target |
|---:|---|
| 9 (B half: rebuild trade pairs) | Extend `building_extensions.scope` to cover full-rebuild scope, OR add a new subcategory `building_full_rebuild` to Building & Construction with `scope: "Whole-building or whole-room rebuilds — kitchen, bathroom, structural renovations..."` and `excludes: ["surface repairs (→ wall_crack_plastering, tile_repair)"]`. |
| 11 (canonical trade list in output schema) | Replace string literal with `composer.ts` injecting `SERVICE_LABELS_ARR.join(', ')` at runtime. |
| 15 (UNSUPPORTED_HOME_SERVICE) | Convert to code-level pre-classification guard in `lib/diagnosis/` that checks user request against `TAXONOMY_SUBCATEGORIES` and short-circuits to unserviced=true before the diagnostic agent runs. |
| 21, 22 (supported/excluded service lists) | Move to single source in `lib/services` exporting `SUPPORTED_TRADES` and `EXCLUDED_SERVICES`; prompt references via composer at runtime. |
| 29 (gate vs garage motor disambiguation) | Confirm taxonomy already covers this (`gate_motor_fault.excludes` does); delete from prompt. Add unit test asserting taxonomy contains this disambiguation pair so it can't drift. |

The taxonomy already has most of what it needs. The migration is mostly *deletion from prompts* plus a few additive entries in the taxonomy file.

## What stays in prompts after Phase 5

After removing Bucket A entirely, migrating Bucket B to taxonomy + code guards, and rephrasing Bucket C to drop the trade-named examples, the remaining prompt content should be:

- The reasoning schema (observations → hypotheses → evidence → rubric-scored confidence) — new in Phase 5.
- The rubric definitions (TRADE-CONFIDENCE / COMPONENT-CONFIDENCE / CAUSE-CONFIDENCE / IMAGE-SUFFICIENCY) — new in Phase 5.
- General principles like "user corrections override visual ambiguity", "diagnose immediately when equipment is identifiable", "ground claims in visible evidence", "absence detection" — all currently exist as Bucket C and survive.
- Output format / JSON schema instructions — survive, but the trade enum becomes a runtime injection.
- Identity / meta-handling rules (IDENTITY_AND_META_PROMPT_BLOCK) — no trade content, survives unchanged.
- Multi-image synthesis protocol (the cross-image observation discipline in agent-prose) — survives; trade examples removed.

Grep target for Phase 5 verification (per plan Success Criteria 8):
```bash
grep -rE "(pool|borehole|garage|gate|kitchen|geyser|capacitor|thermostat|spring|hvac|plumbing|electrical|security|locksmith)" src/features/diagnosis/prompts/
```
Should return **empty** after Phase 5.

## Red-flag note (per plan §Phase 1 task 1)

The plan said: *"If we find more than a handful of Bucket A items, that's a separate red flag worth a Slack message — it means the prompt has been used as a per-case fix vector and we should examine why."*

**We found 19 Bucket A items.** That is decisively more than a handful. The pattern this reveals:

- The prompt files are functioning as the project's *informal* bug tracker for diagnostic edge cases.
- Each per-case patch addresses a real past failure, but the cost (worked-example bias, prompt rot, brittleness) is paid every subsequent diagnosis.
- Phase 5 cannot just delete the patches — it must replace the *mechanism* (per-case patches) with a *system* (structured rubric + taxonomy injection) such that future failures generate rubric tunings or taxonomy edits, not new patches.

This is exactly the trajectory the plan's principle 1 was written to prevent. Phase 5 work is justified.
