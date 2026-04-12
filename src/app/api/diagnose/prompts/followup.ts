import type { PromptPreviousDiagnosis } from './types';

export function buildFollowUpPrompt(previousDiagnosis?: PromptPreviousDiagnosis | null): string {
    if (!previousDiagnosis?.diagnosis) {
        return 'FOLLOW-UP MESSAGES (CRITICAL - when there is already a diagnosis):';
    }

    const tradeDetail =
        typeof previousDiagnosis.trade_detail === 'string' ? previousDiagnosis.trade_detail.trim() : '';

    return `FOLLOW-UP MESSAGES (CRITICAL - when there is already a diagnosis):
The user already has a diagnosis: "${previousDiagnosis.diagnosis}" (trade: ${previousDiagnosis.trade || 'N/A'}; specialty: ${tradeDetail ? JSON.stringify(tradeDetail) : 'none'}).

- When the user provides NEW substantive information (e.g. describes the actual issue, says "actually it's X", "it's a garage door", "I need gate repair", "it's a borehole pump not a pool pump", corrects the initial selection, or shares a new image): You MUST discard the previous diagnosis/trade when they conflict and set diagnosis and trade to match the user. Give a proper diagnosis if you have 85%+ confidence after applying their correction.

- For simple questions ("What?", "Are you sure?", "Why?", "Hello?", "hi") or when the user has NOT shared new details: Answer in 'message'. Set diagnosis="${previousDiagnosis.diagnosis}", trade="${previousDiagnosis.trade || 'N/A'}", trade_detail=${JSON.stringify(typeof previousDiagnosis.trade_detail === 'string' ? previousDiagnosis.trade_detail : '')}, and use similar action_required and estimated_cost (keep repair_cost_range, replacement_cost_range, equipment_parts_range as ""). DO NOT re-diagnose.

- If confidence < 85 on any change: set requires_clarification: true and ask one more specific question to narrow down the diagnosis.

- If the current diagnosis is still vague (e.g. "Plumbing", "Electrical"): ask a targeted follow-up to get a specific diagnosis for the report (e.g. "Is it a leak, no hot water, or a blockage?").`;
}

export function buildDiagnosisRejectedPrompt(diagnosisRejected?: boolean): string {
    if (!diagnosisRejected) return '';
    return `DIAGNOSIS REJECTED (CRITICAL): The user has indicated the diagnosis is incorrect (e.g. they said "No, that's not correct"). You MUST:
1. APOLOGISE: Start by briefly apologising for the incorrect diagnosis (e.g. "Sorry for getting that wrong.")
2. ASK A PROPER QUESTION: Ask a SPECIFIC, TARGETED question that will help you provide the correct diagnosis next time. Do NOT ask vague questions like "Could you describe what's happening?" or "What would you like me to look at?"
   - Instead, ask questions that narrow down what you missed. Examples:
   - For garage/door issues: "Is it the door itself, the motor/opener, the remote, or the tracks that's the problem?"
   - For plumbing: "Is it a leak, a blockage, no hot water, or something else?"
   - For electrical: "Is it a tripping circuit, no power to a specific area, or a faulty appliance?"
   - For structural: "Is it a crack, water damage, or something else I should focus on?"
   - Or: "What specifically isn't working — [option A], [option B], or [option C]?" (give 2–3 concrete options based on what you saw)
3. Set "requires_clarification" to true. Do NOT recommend providers.
4. Keep diagnosis, trade, and trade_detail as before for continuity. The primary response must be: apology + your targeted clarifying question in 'message'.`;
}
