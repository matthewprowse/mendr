/**
 * Phase 5 — V2 follow-up prompt.
 *
 * Differences from V1 (followup.ts):
 *   • Bucket A worked examples removed:
 *       - the "actually it's X" / "it's a garage door" / "I need gate repair" trio
 *       - the per-trade clarification template list (garage/door, plumbing, electrical)
 *   • The integer-threshold gating phrase ("If confidence < ${minConf} ...") is
 *     dropped — V2 gates on the COMPLETION CRITERIA in the rubric block.
 *   • Generic principle preserved: discard prior diagnosis when user contradicts it.
 *
 * See: docs/Diagnosis-Architecture-Hardening-Plan.md §Phase 5
 * See: docs/prompt-content-audit.md rows 17, 19, 20
 */

import type { PromptPreviousDiagnosis } from './types';

export function buildFollowUpPromptV2(previousDiagnosis?: PromptPreviousDiagnosis | null): string {
    if (!previousDiagnosis?.diagnosis) {
        return 'FOLLOW-UP MESSAGES: When there is already a diagnosis, preserve it unless the user explicitly corrects it.';
    }

    const tradeDetail =
        typeof previousDiagnosis.trade_detail === 'string' ? previousDiagnosis.trade_detail.trim() : '';

    return `FOLLOW-UP MESSAGES:
The user already has a diagnosis: "${previousDiagnosis.diagnosis}" (trade: ${previousDiagnosis.trade || 'N/A'}; specialty: ${tradeDetail ? JSON.stringify(tradeDetail) : 'none'}).

- When the user provides NEW substantive information (correction, new image, new symptom): discard the previous diagnosis/trade when they conflict and set diagnosis and trade to match the user. Re-apply the facet rubrics; do not anchor on the prior aggregate.

- For simple questions ("What?", "Are you sure?", "Why?", "Hello?", "hi") or when the user has NOT shared new details: answer in 'message'. Keep diagnosis="${previousDiagnosis.diagnosis}", trade="${previousDiagnosis.trade || 'N/A'}", trade_detail=${JSON.stringify(typeof previousDiagnosis.trade_detail === 'string' ? previousDiagnosis.trade_detail : '')}, and reuse the prior action_required. Do NOT re-diagnose.

- Re-score the FACETS on any substantive change. Apply the COMPLETION CRITERIA from the rubric block to decide whether requires_clarification flips. Do not use a single-integer threshold.

- If the current diagnosis is still trade-level only (the diagnosis title names a service category instead of a specific failed component), ask a targeted follow-up that isolates one observable signal which would discriminate between the two leading hypotheses.`;
}

export function buildRefinementWithNewImagesPromptV2(emit: boolean): string {
    if (!emit) return '';
    return `REFINEMENT MODE — NEW IMAGES ADDED
- New images added in this refinement have been positioned FIRST in the input. The homeowner is drawing your attention to them. Weight them most heavily.
- If the new images reveal a fault that contradicts your prior diagnosis, UPDATE the diagnosis. Explicitly note the change in \`thought\` ("Earlier I suggested X based on Y; the new image of Z shows W, so the diagnosis is now …").
- If the new images CORROBORATE the prior diagnosis, say so clearly in \`thought\` and adjust the facet scores accordingly (image_sufficiency likely moves toward "sufficient"; component_confidence rises).
- If the new images are NEUTRAL (no clear new information), keep the prior diagnosis and acknowledge that no new fault evidence is visible.
- Do NOT invent additional faults the new images do not support.
- The \`photo_request\` field on the prior diagnosis (if any) is the reason for this refinement — try to answer the question it asked.`;
}

export function buildDiagnosisRejectedPromptV2(diagnosisRejected?: boolean): string {
    if (!diagnosisRejected) return '';
    return `DIAGNOSIS REJECTED: The user has indicated the diagnosis is incorrect. You must:
1. APOLOGISE: Start by briefly apologising (e.g. "Sorry for getting that wrong.").
2. ASK A TARGETED QUESTION: ask one specific question that would discriminate between the two leading hypotheses you have left after the rejection. Phrase it around an OBSERVATION the homeowner can make from where they are — not a request to call a specialist.
3. Offer 2–3 concrete options that exhaust the discriminator. Each option must be something the homeowner can answer in one tap.
4. Set "requires_clarification" to true. Do NOT recommend providers.
5. Keep diagnosis, trade, and trade_detail as before for continuity.`;
}
