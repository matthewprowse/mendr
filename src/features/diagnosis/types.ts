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
    /** 2–4 full sentences describing what the contractor will do on-site. */
    contractor_checklist?: string[];
    /** One sentence: the most practical thing the homeowner can do before the contractor arrives. */
    homeowner_prep?: string;
    /** The single specific component that has failed (e.g. "torsion spring"). Empty string when not identifiable. */
    failed_component?: string;
    /** Secondary mechanical/electrical damage caused by the primary failure. Empty string when none. */
    cascading_damage?: string;
    /** One sentence: how the homeowner can themselves verify the diagnosis without tools or risk. */
    diy_verification?: string;
    /** Specific photo that would meaningfully improve the diagnosis. Empty string when none would help. */
    photo_request?: string;
    /** 2–4 short bullets naming what drove the confidence level (supporting evidence and limiting factors). */
    confidence_drivers?: string[];
    /** New in v7.3: structured per-image observations. Backward-compat: image_descriptions remains as derived string array. */
    image_observations?: Array<{
        primary_observation: string;
        components_visible: string[];
        components_missing_or_damaged: string[];
        role_in_diagnosis: 'primary_evidence' | 'corroborating' | 'contradicting' | 'context_only';
    }>;
    /** Legacy view: one short sentence per image. From v7.3, derived server-side from image_observations when not directly produced by the model. */
    image_descriptions?: string[];
    /**
     * Phase 4 — deterministic confidence score computed from observable input/output
     * signals (image count, description length, taxonomy match, etc.) at the time the
     * agent ran. Separate from the model's self-reported `confidence` integer above;
     * this is the value that gates provider surfacing.
     *
     * Older rows (pre-Phase 4) will not have this field — call sites must fall back
     * to the self-reported `confidence` for backwards compatibility.
     */
    structural_confidence?: {
        score: number;
        signals: {
            hasImage: boolean;
            imageCount: number;
            descriptionWordCount: number;
            subcategoryMatched: boolean;
            failedComponentNamed: boolean;
            isCatchAllWithNoVisual: boolean;
            isRejectedOrUnserviced: boolean;
        };
    };
}
