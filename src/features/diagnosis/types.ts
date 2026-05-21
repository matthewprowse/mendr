/**
 * Canonical type definitions for the diagnosis domain.
 *
 * `DiagnosisData` is the normalised in-memory shape that the diagnosis pipeline
 * produces and the UI consumes.  It is stored as JSON in `diagnoses.diagnosis`
 * and hydrated back at read-time — keep fields additive and backward-compatible.
 *
 * `@/app/chat/components/types` re-exports this type for backward compat.
 */

export interface DiagnosisData {
    thinking: string;
    diagnosis: string;
    trade: string;
    action_required: string;
    message?: string;
    rejected?: boolean;
    requires_clarification?: boolean;
    /** True when the need is home-related but we don't offer that service yet. */
    unserviced?: boolean;
    /**
     * Specific subcategory within the trade, extracted by the AI.
     * e.g. trade = "Plumbing", trade_detail = "rising damp / waterproofing".
     */
    trade_detail?: string;
    /** Agent 2a routing slug from taxonomy (e.g. garage_door_fault). */
    subcategory_id?: string;
    /** 0–100. Below 85: ask for more photos/context before showing providers. */
    confidence?: number;
    /**
     * 2–4 short clarifying statements (from the user's perspective) the AI
     * needs answered before producing a confident diagnosis.
     * Only present when requires_clarification is true.
     */
    clarification_questions?: string[];
}
