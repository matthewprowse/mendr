/**
 * Canonical type definitions for the diagnosis domain.
 *
 * `DiagnosisData` is the normalised in-memory shape that the diagnosis pipeline
 * produces and the UI consumes.  It is stored as JSON in `diagnoses.diagnosis`
 * and hydrated back at read-time — keep fields additive and backward-compatible.
 *
 * Previously lived in `@/app/chat/components/types`; moved here so lib/, api/,
 * and features/ code can import it without pulling in chat-layer modules.
 * `@/app/chat/components/types` re-exports this type for backward compat.
 */

export interface DiagnosisData {
    thinking: string;
    diagnosis: string;
    trade: string;
    action_required: string;
    /** Short ZAR job-level summary from the model (Beta). */
    estimated_cost: string;
    /** @deprecated Call-out is now calculated from distance on report view. */
    callout_fee?: string;
    /** @deprecated Use repair_cost_range and replacement_cost_range. */
    repair_or_replacement_fee?: string;
    /** @deprecated Not used; kept for legacy stored rows. Always empty for new diagnoses. */
    repair_cost_range?: string;
    /** @deprecated Not used; kept for legacy stored rows. Always empty for new diagnoses. */
    replacement_cost_range?: string;
    /** @deprecated Not used; kept for legacy stored rows. Always empty for new diagnoses. */
    equipment_parts_range?: string;
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
    /**
     * Normalized urgency key from SQL reference data.
     * Links to diagnosis_urgencies.key, e.g. 'immediate', 'urgent', 'soon', 'planned'.
     */
    urgency_key?: string;
    /**
     * Consumer-friendly one-sentence translation of urgency_key for the homeowner.
     */
    urgency_sentence?: string;
    /**
     * Predicted invoice line-item names for this repair.
     * e.g. ["Call-out fee", "Capacitor replacement", "Labour (1–2 hours)"]
     */
    expected_parts?: string[];
    /**
     * Retail / installed ZAR estimates per {@link expected_parts} line item.
     */
    expected_part_prices?: Array<{
        part_name: string;
        variant?: string;
        price_min: number | null;
        price_max: number | null;
        price_display: string | null;
        min_price?: number | null;
        max_price?: number | null;
        price_displayed?: string | null;
        from_cache?: boolean;
    }>;
    /**
     * Cached web research (Brave Search snippets + Gemini cost refinement) for Beta cost outlook.
     */
    market_rates?: {
        from_cache?: boolean;
        fetched_at?: string;
        region_key?: string;
        sources?: Array<{
            url: string;
            title: string;
            snippet?: string;
            intent?: string;
        }>;
    };
}
