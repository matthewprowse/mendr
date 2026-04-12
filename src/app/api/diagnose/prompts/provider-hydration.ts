import type { PromptPreviousDiagnosis } from './types';

/**
 * Appended to the system instruction on provider-hydration turns only (see /api/diagnose).
 */
export function buildProviderHydrationPromptBlock(
    userOriginalWords: string,
    previous: PromptPreviousDiagnosis
): string {
    const words = userOriginalWords.trim().slice(0, 500);
    const msg =
        typeof previous.message === 'string' && previous.message.trim()
            ? previous.message.trim().slice(0, 1500)
            : '';
    const action =
        typeof previous.action_required === 'string' && previous.action_required.trim()
            ? previous.action_required.trim().slice(0, 800)
            : '';
    const cost =
        typeof previous.estimated_cost === 'string' && previous.estimated_cost.trim()
            ? previous.estimated_cost.trim().slice(0, 400)
            : '';

    return `PROVIDER HYDRATION TURN (CRITICAL, INTERNAL):
The Scandio report is already established. Recommended providers are listed above under RECOMMENDED PROVIDERS.
Output <thought> then <json>. In <thought>, give 2–3 short sentences that stay consistent with the image and with the established issue (do not contradict the diagnosis below).
Preserve diagnosis, estimated_diagnosis_sentence, trade, trade_detail, confidence, urgency_key, refetch_providers, rejected, requires_clarification, and unserviced unless they are clearly wrong.
Preserve estimated_cost and action_required verbatim unless you must fix a clear contradiction with the image; do not dilute technical detail in action_required.
Refresh "message" (still 2 or 3 paragraphs, same paragraph rules as usual):
- If USER ORIGINAL WORDS asked for nearby companies, contractors, businesses, "who can help", pool companies near me, specialists in the area, or similar: Paragraph 2 MUST name at least one and ideally two providers, using EXACT names from RECOMMENDED PROVIDERS. Add distance or area text when RECOMMENDED PROVIDERS lists Distance or Area. If one row is marked [SCANDIO'S PICK], mention that one by name first and briefly why (rating, reviews, or Reason) without sounding robotic.
- Otherwise: still add one short sentence in Paragraph 2 that names the top local option from RECOMMENDED PROVIDERS when it fits naturally, without changing the technical substance of Paragraph 1.
Paragraph 1 must remain the causal / teaching diagnosis (not only restating what is visible).

USER ORIGINAL WORDS:
${JSON.stringify(words || '(none)')}

FROZEN REPORT SNIPPETS (preserve substance; you may weave provider names into Paragraph 2):
Prior message:
${JSON.stringify(msg || '(none)')}
Prior action_required:
${JSON.stringify(action || '(none)')}
Prior estimated_cost:
${JSON.stringify(cost || '(none)')}`;
}
