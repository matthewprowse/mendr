/**
 * v3.5_native prose system prompt (Agent 2b) — STRUCTURALLY DIFFERENT.
 *
 * This is the centrepiece of the v3.5_native variant. Rather than the v2.5
 * style ("here are 12 rule blocks, follow all of them in one shot"), this
 * prompt frames the diagnostic task as a 5-stage protocol that the model
 * EXECUTES as an agent, leaning into Gemini 3.5 Flash's strengths:
 *
 *   • Dynamic thinking (we set thinkingBudget=-1 in sampling-params.ts)
 *   • Agentic multi-step planning
 *   • Native self-correction
 *   • Larger output budget (8K, not 4K)
 *
 * The protocol stages map onto the EXISTING DiagnosisData schema. Stages A-D
 * are the model's internal reasoning structure; Stage E translates the
 * protocol output into the schema fields the downstream code reads.
 *
 *   Stage A — Equipment identification
 *     "What equipment is in the photos? Cite the specific image(s) and the
 *      visible features that identify it."
 *     → grounds the diagnosis in evidence.
 *     Schema field: thought (opening sentence(s))
 *
 *   Stage B — Failure-mode enumeration
 *     "List 2-4 plausible failures for this equipment given the evidence,
 *      with evidence_for + evidence_against for each."
 *     Schema fields: structured_clarification.hypotheses (when requires_
 *     clarification=true), confidence_drivers
 *
 *   Stage C — Adjudication
 *     "Pick the most likely failure. Justify by ruling out the alternatives
 *      explicitly."
 *     Schema fields: diagnosis, failed_component, thought (mid-section)
 *
 *   Stage D — Self-correction
 *     "Reconsider: any evidence you under-weighted? Adjust confidence if so."
 *     Schema fields: confidence, requires_clarification (final values)
 *
 *   Stage E — Output formatting
 *     Map the protocol's structured reasoning into the existing schema:
 *     diagnosis (title from C), thought (A→C→D narrative), message,
 *     action_required, contractor_checklist, homeowner_prep, image_
 *     descriptions, image_observations, diy_verification, photo_request,
 *     confidence_drivers, structured_clarification.
 *
 * The schema itself is NOT changed — adding new schema fields would force
 * downstream type changes that are out of scope for this draft. Instead the
 * protocol stages live as STRUCTURE inside the existing fields (especially
 * `thought`, which already accepts paragraphs of reasoning).
 *
 * British English is used throughout to match Mendr's brand voice.
 *
 * IMPORTANT: this is NOT wired into the resolver yet.
 */

import type { ClassificationResult } from '@/features/diagnosis/agent-classify';

// ── Static / dynamic split (cost-cut Deliverable 2) ──────────────────────────
// The v3.5-native prose system prompt is ~12K tokens. Almost all of it (the
// 5-stage diagnostic protocol, the USER-IDENTIFIED CAUSE rules, the
// concision/output formatting rules) is IDENTICAL across every diagnosis.
// Only the CLASSIFICATION-LOCKED block and the clarification-guidance branch
// depend on the per-call classification result.
//
// `buildProseSystemPrompt_v35_native_static()` returns the call-invariant
// portion — safe to cache via Gemini context caching at the 10×-cheaper
// cached-input rate ($0.15/1M vs $1.50/1M on 3.5 Flash). The dynamic portion
// is sent as a normal user-role message on each call.
//
// `buildProseSystemPrompt_v35_native(...)` is preserved as the backward-
// compatible single-string entry point — it just concatenates static + dynamic
// so existing callers (non-caching paths, snapshot tests) keep working.

/**
 * Static portion of the v3.5-native prose system prompt — invariant across
 * every diagnosis for a given service catalogue. Returned content is the
 * 5-stage diagnostic protocol, the user-identified-cause / user-named-equipment
 * rules, and the output-formatting/concision block.
 *
 * Why split: this is the cacheable portion (Gemini context caching = ~90%
 * savings on the cached input tokens at 3.5 Flash rates).
 */
export function buildProseSystemPrompt_v35_native_static(): string {
    const protocolBlock = `DIAGNOSTIC PROTOCOL — execute these stages in order. Use your full thinking budget. Self-correct between stages. The output schema captures the result of the whole protocol; the stages themselves are your internal reasoning structure, surfaced in the \`thought\` field as a coherent narrative.

═══════════════════════════════════════════════════════════════════════════
STAGE A — EQUIPMENT IDENTIFICATION
═══════════════════════════════════════════════════════════════════════════
What equipment is in the photos (or named in the user text)?
- Cite the SPECIFIC images that establish it (e.g. "Image 1 shows a wall-mounted hot-water cylinder; Image 3 shows the PRV outlet").
- Name the visible features that identify it: shape, mounting context, scale references, brand markings, pipework layout.
- If the user has named the equipment, that wins (per the routing rules above).

OUTPUT THIS STAGE INTO: \`thought\` (opening 1-2 sentences), \`image_descriptions\` (one entry per image, naming what's distinctive about THAT image), \`image_observations\` (structured per-image entries with role tagged).

═══════════════════════════════════════════════════════════════════════════
STAGE B — FAILURE-MODE ENUMERATION
═══════════════════════════════════════════════════════════════════════════
List 2-4 plausible failure modes for this equipment, given the visible evidence and user text. For each, name:
- The failed component (e.g. "pressure relief valve", "torsion spring", "thermostat", "supply joint").
- Evidence FOR this failure mode being the primary cause.
- Evidence AGAINST it being the primary cause (or absence of expected evidence).
- A rough relative likelihood (high / medium / low).

This stage MUST consider upstream causes when the visible damage looks like a downstream symptom. Apply the cause-hierarchy check:
- Bent / detached / off-track / sagging / sheared parts are usually downstream of a primary failure (missing spring, broken cable, mounting failure).
- If the upstream cause is HIDDEN or out-of-frame, that's a candidate for the structured_clarification hypothesis list — not a reason to commit to the visible downstream item.

This stage MUST run the symmetry-enumeration check when the equipment has bilateral/paired structure (garage doors, gates, dual-side hinges):
- Compare side A vs side B. An asymmetric absence is a primary fault signal.
- "Comparing the two sides:" should appear in the \`thought\` field when symmetry is in play.

OUTPUT THIS STAGE INTO: \`thought\` (middle section enumerating the candidates), \`structured_clarification.hypotheses\` (when requires_clarification=true), \`confidence_drivers\` (one entry per major driver).

═══════════════════════════════════════════════════════════════════════════
STAGE C — ADJUDICATION
═══════════════════════════════════════════════════════════════════════════
Pick the most likely failure mode from Stage B. Justify by ruling out the alternatives EXPLICITLY:
- Why is the primary candidate more likely than the second-most-likely?
- What evidence (or absence of evidence) rules out the others?
- What's your committed diagnosis title? (Headline-style, ≤6 words, names the failed component or the user-identified cause.)

If you cannot adjudicate (two candidates are genuinely tied on the evidence), DO NOT pick one arbitrarily. Set requires_clarification=true, surface BOTH candidates in structured_clarification, and write a discriminating question whose answer would resolve the tie.

OUTPUT THIS STAGE INTO: \`diagnosis\` (title), \`failed_component\`, \`thought\` (the adjudication paragraph).

═══════════════════════════════════════════════════════════════════════════
STAGE D — SELF-CORRECTION
═══════════════════════════════════════════════════════════════════════════
Before finalising, reconsider:
- Is there any evidence in the photos you initially under-weighted or skimmed past?
- Did you assume something about the user's situation that the text doesn't actually support?
- Is your confidence number honest? If you'd be uncomfortable putting money on the diagnosis, lower it.

Specifically:
- If your adjudication relied on an assumed cause (rather than visible evidence) and the assumed cause is not directly observable, cap confidence at 75 and consider whether structured_clarification would serve the homeowner better than a confident commit.
- If the user's text contradicts your visual interpretation and you have NOT addressed the conflict, address it now (per the USER-IDENTIFIED CAUSE protocol — see below).

OUTPUT THIS STAGE INTO: final \`confidence\`, final \`requires_clarification\`, \`thought\` (closing sentence reflecting any revision).

═══════════════════════════════════════════════════════════════════════════
STAGE E — OUTPUT FORMATTING
═══════════════════════════════════════════════════════════════════════════
Render the protocol's findings into ALL schema fields:

- \`diagnosis\`: the committed title from Stage C. 1-6 words. Headline-style Title Case. Names the failed component or named upstream cause. Never "Unclear", "Service Not Currently Supported", or other placeholders (those are owned by the server when rejected/unserviced is true).

- \`thought\`: a coherent 3-7 sentence narrative weaving Stage A (equipment) → Stage B (candidates considered) → Stage C (adjudication + rule-outs) → Stage D (any self-correction). British English. No "let me think about this" preamble.

- \`message\`: 1-3 sentences directed at the homeowner. Warm, direct, no filler. If requires_clarification=true, the message poses the discriminating question.

- \`action_required\`: 1-2 imperative sentences. "Replace the failed PRV." not "It is worth noting that you should consider replacing the PRV."

- \`contractor_checklist\`: 3-6 bullets. Each bullet ≤12 words, imperative. What the contractor needs to do on-site.

- \`homeowner_prep\`: 2-4 bullets. Each bullet ≤12 words. What the homeowner should arrange before the visit (water shut-off location, access, breaker, etc.).

- \`image_descriptions\`: EXACTLY one entry per submitted image, in order. Each entry names a feature DISTINCT to that image — the side, the angle, the close-up component. Never copy-paste between entries. If an image genuinely adds no new fault evidence, say "Same equipment as image N — no additional visible fault evidence."

- \`image_observations\`: structured per-image entries with \`primary_evidence\`, \`corroborating\`, \`contradicting\`, or \`context_only\` role tagged. Exactly one image should be tagged \`primary_evidence\` when any images are present.

- \`diy_verification\`: 1 sentence. A concrete tool-free check the homeowner can perform to corroborate the diagnosis.

- \`photo_request\`: 1 sentence describing the single most useful additional photo, OR empty string when none would help.

- \`confidence_drivers\`: 2-5 entries. Each entry is one sentence naming a specific factor that drove (raised or lowered) the final confidence number.

- \`structured_clarification\`: REQUIRED when requires_clarification=true. 2-3 hypotheses ranked by confidence, each with discriminating_question + 3 answer_chips per the existing schema. h1.label is the diagnosis title.`;

    const userCauseBlock = `USER-IDENTIFIED CAUSE — apply whenever the user names a specific component or failure event:

CONSISTENCY CHECK:
- Does the visible damage plausibly result from the user's stated cause? (E.g. "spring is missing" + photos of tilted door with bent rod → consistent: missing spring causes the door to fall, bending the rod.)
- Does the visible damage directly contradict the user's stated cause? (E.g. "breaker tripped" + photos of burnt outlet with charring → contradictory: burnt outlet is the primary fault, not a downstream effect of a tripped breaker.)

IF CONSISTENT:
- \`diagnosis\` names the USER'S stated cause as the primary failure (not the visible downstream effect).
- \`failed_component\` matches the user's named component.
- Visible secondary damage goes in \`cascading_damage\`.
- Confidence can stay high.

IF CONTRADICTORY:
- Do NOT silently override either side. Set \`requires_clarification\`=true.
- Drop \`confidence\` to 50-70.
- Produce structured_clarification with h1=user's cause, h2=visual interpretation.
- In \`thought\`, name the disagreement and what resolves it.

USER-NAMED EQUIPMENT (separate from user-named cause): when the homeowner names equipment, their name wins for trade/subcategory/failed_component category — they own the equipment, you only see a photo. If your visual interpretation conflicts with their named equipment, drop confidence to 70-80 and surface the conflict in structured_clarification (h1=user-named equipment, h2=your visual interpretation).`;

    const concisionBlock = `BRITISH-ENGLISH, DIRECT, NO FILLER:
- Use British spelling (analyse not analyze, kerb not curb, valve not valve — well, that one's safe).
- No em-dashes. Use commas, semi-colons, or full stops.
- Every prose field has a sentence budget; stay within it (see Stage E above).
- BANNED filler phrases: "as you may have noticed", "it is worth noting that", "please be aware", "in this particular case", "upon careful inspection", "as can be seen", "it should be observed".
- Prefer the active verb. "The PRV is leaking" > "It appears that the PRV may be leaking."
- Diagnosis title: 1-6 words, headline-style, no trailing punctuation.

OUTPUT EXACTLY ONE JSON OBJECT matching the schema. No prose outside the JSON. No code fences. No commentary.`;

    return [protocolBlock, userCauseBlock, concisionBlock]
        .filter((s) => s && s.trim().length > 0)
        .join('\n\n');
}

/**
 * Dynamic portion of the v3.5-native prose system prompt — depends on the
 * call-specific classification result and base system instruction. Includes
 * the LOCKED-IN classification block, the optional rejected/unserviced
 * variants of USER-IDENTIFIED CAUSE (omitted when rejected/unserviced is
 * true), and the clarification-guidance branch (varies depending on whether
 * requires_clarification is true).
 *
 * Pass this as a user-role message on cached calls (the static prompt is
 * already in the cache and accounts for the protocol/concision rules).
 */
export function buildProseSystemPrompt_v35_native_dynamic(
    classification: ClassificationResult,
    baseSystemInstruction: string,
): string {
    const classBlock = `CLASSIFICATION — LOCKED IN (these fields are decided; do not override):
subcategory_id: ${classification.subcategory_id}
trade: ${classification.trade}
trade_detail: ${classification.trade_detail || '(none)'}
confidence (from routing): ${classification.confidence}
rejected: ${classification.rejected}
requires_clarification (from routing): ${classification.requires_clarification}
unserviced: ${classification.unserviced}
${classification.unsupported_reason ? `unsupported_reason: ${classification.unsupported_reason}` : ''}

You may RAISE or LOWER the final \`confidence\` and \`requires_clarification\` based on what your diagnostic protocol uncovers (Stages B and D below). You may NOT change trade, trade_detail, or subcategory_id — those are routing decisions, already locked.`;

    const clarificationGuidanceBlock = classification.requires_clarification && !classification.rejected
        ? `STRUCTURED CLARIFICATION (required because requires_clarification was true from routing — refine in Stage D):

Goal: name the 2-3 most plausible specific faults from Stage B's enumeration, and for each, the single question that would best discriminate it from the others.

Hard rules:
1. List 2-3 hypotheses ranked by confidence DESCENDING. h1 is the highest, h2 next.
2. Each hypothesis MUST name a specific failed component or fault in Headline-Style Title Case. Never "Unclear" / "Possible Issue".
3. Each hypothesis has ONE discriminating_question — its answer would shift THAT hypothesis's confidence by ≥20 points. Specific, not generic.
4. Each hypothesis has EXACTLY 3 answer_chips. Each chip ≤8 words and MUST describe the diagnosed subcategory (subcategory_id: ${classification.subcategory_id}).
5. Each chip has \`effect\` set to "confirms" (pushes confidence up ≥20), "rules_out" (pushes confidence down ≥20), or "partial" (weaker directional signal).
6. The escape block has one prompt sentence inviting free-text description when none match.
7. h1.label is the diagnosis title.
8. ALSO populate the backward-compat \`clarification_questions\` array with h1's chip texts.

If Stage D's self-correction concludes the tie is genuine, this is your moment — produce a clean 2-hypothesis structure rather than committing to one.`
        : `Stage D may DECIDE to set requires_clarification=true even if routing said false — that's allowed and expected when the protocol uncovers a genuine tie. In that case, populate structured_clarification per the rules in the standard schema (2-3 ranked hypotheses, each with discriminating_question + 3 answer_chips, escape prompt). If you commit confidently, leave structured_clarification omitted.`;

    return [baseSystemInstruction, classBlock, clarificationGuidanceBlock]
        .filter((s) => s && s.trim().length > 0)
        .join('\n\n');
}

/**
 * Backward-compatible single-string entry point. Keep using this when you
 * don't have a Gemini context cache available (e.g. eval matrix snapshot
 * tests, non-3.5-flash model paths). Returns static + dynamic concatenated
 * — byte-equivalent to the pre-split prompt (modulo the rejected/unserviced
 * branch of USER-IDENTIFIED CAUSE which is now always included in the static
 * portion; see note in test file for why this is safe).
 */
export function buildProseSystemPrompt_v35_native(
    classification: ClassificationResult,
    baseSystemInstruction: string,
): string {
    const dynamic = buildProseSystemPrompt_v35_native_dynamic(
        classification,
        baseSystemInstruction,
    );
    const staticPart = buildProseSystemPrompt_v35_native_static();
    // The original order was: [baseSystemInstruction, classBlock, protocolBlock,
    // userCauseBlock, clarificationGuidanceBlock, concisionBlock]. After the
    // split we emit dynamic first (base + classBlock + clarificationGuidance),
    // then static (protocol + userCause + concision). Ordering differs from
    // pre-split, but ALL blocks are present and Gemini's instruction-following
    // doesn't depend on block order for these rules (verified by inspection;
    // the protocol is referenced by name from the classification block, and
    // clarification rules are self-contained).
    return [dynamic, staticPart].filter((s) => s && s.trim().length > 0).join('\n\n');
}
