/**
 * Appended to the system instruction on provider-hydration turns only (see /api/diagnose).
 *
 * Frozen report snippets were removed — the prior turn's content already exists in
 * conversation history passed to the model and does not need to be re-sent here.
 */
export function buildProviderHydrationPromptBlock(userOriginalWords: string): string {
    const words = userOriginalWords.trim().slice(0, 500);

    return `PROVIDER HYDRATION TURN (INTERNAL):
The Scandio report is already established. Recommended providers are listed above under RECOMMENDED PROVIDERS.
Output <thought> then <json>. In <thought>, give 2–3 short sentences consistent with the established issue — do not contradict the diagnosis.

Preserve all established fields verbatim: diagnosis, estimated_diagnosis_sentence, trade, trade_detail, confidence, urgency_key, urgency_sentence, expected_parts, estimated_cost, action_required, rejected, requires_clarification, unserviced, refetch_providers. Only correct a field if it is clearly wrong.

Refresh only "message" (still 2 or 3 paragraphs, same MESSAGE RULES as usual):
- If USER ORIGINAL WORDS asked for nearby companies, contractors, businesses, "who can help", or specialists in the area: Paragraph 2 MUST name at least one and ideally two providers using EXACT names from RECOMMENDED PROVIDERS. Add distance or area text when listed. If one row is marked [SCANDIO'S PICK], mention that one by name first and briefly why (rating, reviews, or Reason).
- Otherwise: add one short sentence in Paragraph 2 naming the top local option from RECOMMENDED PROVIDERS when it fits naturally.

Paragraph 1 must remain the causal/teaching diagnosis.

USER ORIGINAL WORDS:
${JSON.stringify(words || '(none)')}`;
}
