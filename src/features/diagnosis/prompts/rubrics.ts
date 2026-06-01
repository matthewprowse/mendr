/**
 * Phase 5 of the Diagnosis Architecture Hardening Plan.
 *
 * Single canonical source of the four rubric definitions Agent 2a applies
 * when filling each uncertainty facet (Phase 4 schema). The V2 system prompt
 * injects these blocks verbatim so the rubric is auditable from one file and
 * the prompt body stays Bucket-C-clean (no trade-named worked examples).
 *
 * Decision rule for the rubric phrasing:
 *   • Each item names a GENERAL signal — "user named the failed component",
 *     "image is unhelpful", etc.
 *   • Items never name a specific trade. Trade-specific reasoning happens via
 *     the taxonomy serialiser; the rubric only encodes domain-agnostic
 *     heuristics for scoring.
 *
 * See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 5 (rubric block)
 * See: docs/prompt-decision-rules-2026-05.md §Part B (the gaps these rubrics close)
 */

export const TRADE_CONFIDENCE_RUBRIC = `TRADE-CONFIDENCE RUBRIC (score 0–100, integer)
  +30 if equipment in image matches exactly one supported trade scope
  +30 if the user named the trade or service explicitly
  +20 if the user named a component associated with exactly one trade
  +10 if the symptoms map to only one trade
  -20 if the image contradicts the user's stated equipment type
  -20 if more than one supported trade plausibly fits
  Floor: 30. Ceiling: 100.`;

export const COMPONENT_CONFIDENCE_RUBRIC = `COMPONENT-CONFIDENCE RUBRIC (score 0–100, integer)
  +30 if the failed component is visible in the image
  +30 if the user named the failed component explicitly
  +20 if the symptom uniquely implicates exactly one component
  +10 if the component is the most common failure mode for that equipment + symptom pair
  -20 if more than one component could produce the observed symptom
  -10 if image quality prevents component identification
  Floor: 0. Ceiling: 100.
Note: a fully-specified text description that names the component and the symptom is sufficient to reach 80+ even when image_sufficiency is "absent". Component confidence is INDEPENDENT of image quality.`;

export const CAUSE_CONFIDENCE_RUBRIC = `CAUSE-CONFIDENCE RUBRIC (score 0–100, integer)
  +30 if the cause is implied by the failure mode (a broken thing has broken)
  +20 if the cause is the dominant failure path for the component
  +10 if secondary supporting evidence is present (rust, scaling, age, weather correlation)
  -20 if multiple causes could produce the same symptom
  -10 if the user description introduces a cause inconsistent with the image
  Floor: 0. Ceiling: 100.`;

export const IMAGE_SUFFICIENCY_RUBRIC = `IMAGE-SUFFICIENCY ENUM (pick exactly one)
  • sufficient — the fault can be identified from this image alone, with no remaining ambiguity about the failed component.
  • partial   — the image shows context (the equipment, the area) but the failed component itself is obscured, out of frame, or at insufficient resolution.
  • unhelpful — an image is present but adds no diagnostic value (wrong area, severe blur, irrelevant content).
  • absent    — no image was provided.
Note: image_sufficiency is INDEPENDENT of component_confidence. A text-only submission ("absent") can still produce high component_confidence when the user fully specifies the failure.`;

export const COMPLETION_CRITERIA = `COMPLETION CRITERIA (apply after scoring all facets)
For the diagnosis to be safely committed without further clarification:
  1. component_confidence ≥ 75
  2. cause_confidence ≥ 75
  3. Either image_sufficiency is not "absent", OR both component_confidence and cause_confidence are ≥ 85.
If any criterion fails AND a single targeted question would resolve the gap → set requires_clarification=true.
Otherwise → commit even at moderate confidence; the system will surface the hedged prose downstream.`;

/**
 * The full rubric block emitted into the V2 system prompt. Concatenates each
 * rubric with explicit separators so the model parses them as distinct units.
 */
export function buildRubricsBlock(): string {
    return [
        TRADE_CONFIDENCE_RUBRIC,
        COMPONENT_CONFIDENCE_RUBRIC,
        CAUSE_CONFIDENCE_RUBRIC,
        IMAGE_SUFFICIENCY_RUBRIC,
        COMPLETION_CRITERIA,
    ].join('\n\n');
}
