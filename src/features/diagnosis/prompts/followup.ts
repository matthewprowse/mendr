import { DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS } from '@/lib/diagnosis/diagnosis-confidence';
import type { PromptPreviousDiagnosis } from './types';

const minConf = DIAGNOSIS_MIN_CONFIDENCE_FOR_PROVIDERS;

export function buildFollowUpPrompt(previousDiagnosis?: PromptPreviousDiagnosis | null): string {
    if (!previousDiagnosis?.diagnosis) {
        return 'FOLLOW-UP MESSAGES: When there is already a diagnosis, preserve it unless the user explicitly corrects it.';
    }

    const tradeDetail =
        typeof previousDiagnosis.trade_detail === 'string' ? previousDiagnosis.trade_detail.trim() : '';

    return `FOLLOW-UP MESSAGES:
The user already has a diagnosis: "${previousDiagnosis.diagnosis}" (trade: ${previousDiagnosis.trade || 'N/A'}; specialty: ${tradeDetail ? JSON.stringify(tradeDetail) : 'none'}).

- When the user provides NEW substantive information (e.g. describes the actual issue, says "actually it's X", "it's a garage door", "I need gate repair", "it's a borehole pump not a pool pump", corrects the initial selection, or shares a new image): discard the previous diagnosis/trade when they conflict and set diagnosis and trade to match the user. Give a proper diagnosis if you have ${minConf}%+ confidence after applying their correction.

- For simple questions ("What?", "Are you sure?", "Why?", "Hello?", "hi") or when the user has NOT shared new details: answer in 'message'. Set diagnosis="${previousDiagnosis.diagnosis}", trade="${previousDiagnosis.trade || 'N/A'}", trade_detail=${JSON.stringify(typeof previousDiagnosis.trade_detail === 'string' ? previousDiagnosis.trade_detail : '')}, and use similar action_required. Do NOT re-diagnose.

- If confidence < ${minConf} on any change: set requires_clarification: true and ask one more specific question to narrow down the diagnosis.

- If the current diagnosis is still vague (e.g. "Plumbing", "Electrical"): ask a targeted follow-up to get a specific diagnosis (e.g. "Is it a leak, no hot water, or a blockage?").`;
}

/**
 * Emitted on `/api/diagnoses/[id]/refine` when the user has just attached one
 * or more NEW photos to an existing diagnosis. The new images are positioned
 * FIRST in the input — Gemini's attention weight will favour them, and that
 * positioning is the homeowner's signal: "look at THIS first".
 *
 * Conditions for emission (handled by the caller, not this builder):
 *   - refinement is in progress
 *   - additionalImageUrls.length > 0
 */
export function buildRefinementWithNewImagesPrompt(emit: boolean): string {
    if (!emit) return '';
    return `REFINEMENT MODE — NEW IMAGES ADDED
- New images added in this refinement have been positioned FIRST in the input. The homeowner is drawing your attention to them. Weight them most heavily.
- If the new images reveal a fault that contradicts your prior diagnosis, UPDATE the diagnosis. Explicitly note the change in \`thought\` ("Earlier I suggested X based on Y; the new image of Z shows W, so the diagnosis is now …").
- If the new images CORROBORATE the prior diagnosis, say so clearly in \`thought\` and increase confidence appropriately.
- If the new images are NEUTRAL (no clear new information), keep the prior diagnosis and acknowledge that no new fault evidence is visible.
- Do NOT invent additional faults the new images do not support.
- The \`photo_request\` field on the prior diagnosis (if any) is the reason for this refinement — try to answer the question it asked.`;
}

export function buildDiagnosisRejectedPrompt(diagnosisRejected?: boolean): string {
    if (!diagnosisRejected) return '';
    return `DIAGNOSIS REJECTED: The user has indicated the diagnosis is incorrect. You must:
1. APOLOGISE: Start by briefly apologising (e.g. "Sorry for getting that wrong.").
2. ASK A TARGETED QUESTION: Ask a specific question that will help you give the correct diagnosis. Do NOT ask vague questions like "Could you describe what's happening?". Instead ask questions that narrow down what you missed. Examples:
   - For garage/door issues: "Is it the door itself, the motor/opener, the remote, or the tracks that's the problem?"
   - For plumbing: "Is it a leak, a blockage, no hot water, or something else?"
   - For electrical: "Is it a tripping circuit, no power to a specific area, or a faulty appliance?"
   - Or: "What specifically isn't working — [option A], [option B], or [option C]?" (give 2–3 concrete options based on what you saw)
3. Set "requires_clarification" to true. Do NOT recommend providers.
4. Keep diagnosis, trade, and trade_detail as before for continuity.`;
}
