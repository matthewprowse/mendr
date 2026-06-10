/**
 * Appended to the system instruction on provider-hydration turns only (see /api/diagnose).
 *
 * Frozen report snippets were removed — the prior turn's content already exists in
 * conversation history passed to the model and does not need to be re-sent here.
 */
export function buildProviderHydrationPromptBlock(userOriginalWords: string): string {
    const words = userOriginalWords.trim().slice(0, 500);

    return `PROVIDER HYDRATION TURN (INTERNAL):
The Mendr report is already established. Recommended providers are listed above under RECOMMENDED PROVIDERS.
Output <thought> then <json>. In <thought>, give 2–3 short sentences consistent with the established issue — do not contradict the diagnosis.

Preserve all established fields verbatim: diagnosis, estimated_diagnosis_sentence, trade, trade_detail, confidence, action_required, rejected, requires_clarification, unserviced, refetch_providers. Only correct a field if it is clearly wrong.

Refresh only "message" (still 2 or 3 paragraphs, same MESSAGE RULES as usual):
- NEVER name any provider, company, or business in the 'message' field. Providers are displayed as cards in the UI and must not be named in text.
- If USER ORIGINAL WORDS asked for nearby companies, contractors, businesses, "who can help", or specialists in the area: acknowledge in Paragraph 2 that local professionals are shown in the cards below — do not name them.
- Paragraph 2 should focus on what the technician will do and what the homeowner can expect.

Paragraph 1 must remain the causal/teaching diagnosis.

USER ORIGINAL WORDS:
${JSON.stringify(words || '(none)')}`;
}
