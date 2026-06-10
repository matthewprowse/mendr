/**
 * Canonical type definitions for the diagnosis domain.
 *
 * `DiagnosisData` is the normalised in-memory shape that the diagnosis pipeline
 * produces and the UI consumes.  It is stored as JSON in `diagnoses.diagnosis`
 * and hydrated back at read-time — keep fields additive and backward-compatible.
 *
 * `@/app/chat/components/types` re-exports this type for backward compat.
 */

/**
 * One clarification question + its pre-defined answer chips. The carousel UI
 * renders one of these per card. Keep `options` tight (2–4) — the carousel
 * card is a footer-sized surface and answer chips wrap awkwardly past four.
 */
export type ClarificationQuestion = {
    /** Stable id for React keying. Falls back to array index when missing. */
    id?: string;
    /** Plain-English question. No trailing colon. */
    question: string;
    /** 2–4 answer options. */
    options: string[];
};

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
     *
     * Legacy shape: ONE question (rendered as the prompt above the chips) with
     * up to 3 candidate answer strings. The frontend wraps this into a single
     * ClarificationCarousel card when the new `clarification_question_set`
     * field below is absent.
     */
    clarification_questions?: string[];
    /**
     * New (additive) clarification shape: an ordered list of independent
     * questions, each with its own pre-defined answer chips. Surfaced by the
     * frontend as a swipeable carousel where the user picks one answer per
     * card and submits the batch at the end.
     *
     * Backwards-compatible: legacy diagnosis rows have only the flat
     * `clarification_questions` array above. The UI bridges by wrapping it as
     * `[{ question: "<derived prompt>", options: clarification_questions }]`.
     */
    clarification_question_set?: ClarificationQuestion[];
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
     * Top 3 candidate trades the classifier considered, ranked by score
     * (0-100). Lets the rejection UI surface soft suggestions ("did you mean
     * Security, Building & Construction, or Welding?") when the primary
     * trade is N/A or low-confidence. Empty array when not emitted by the
     * model or when the diagnosis request failed.
     */
    trade_candidates?: Array<{ trade: string; score: number }>;
    /**
     * Agent 2b structured multi-hypothesis clarification payload. When present,
     * the frontend renders the StructuredClarification carousel.
     */
    structured_clarification?: DiagnosisStructuredClarification;
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

// ─────────────────────────────────────────────────────────────────────────────
// Agent 2b structured clarification (multi-hypothesis carousel).
// ─────────────────────────────────────────────────────────────────────────────

export interface DiagnosisStructuredClarification {
    intro?: string;
    escape?: { prompt?: string };
    hypotheses: Array<{
        id: string;
        label: string;
        confidence?: number;
        why?: string;
        discriminating_question?: string;
        answer_chips: Array<{ id: string; text: string; effect?: unknown; [key: string]: unknown }>;
        [key: string]: unknown;
    }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 2c structured reasoning + Phase 6 recommended-action rubric.
// ─────────────────────────────────────────────────────────────────────────────

export interface DiagnosticReasoningHypothesis {
    id?: string;
    label?: string;
    confidence_alone?: number;
    evidence_for?: string[];
    evidence_against?: string[];
    [key: string]: unknown;
}

export interface DiagnosticReasoningChip {
    id?: string;
    supports?: string | null;
    rules_out?: string[] | null;
    [key: string]: unknown;
}

export interface DiagnosticReasoning {
    hypotheses?: DiagnosticReasoningHypothesis[];
    chips?: DiagnosticReasoningChip[];
    [key: string]: unknown;
}

/** Agent 2a deterministic facet scores used by the commit-vs-clarify rubric. */
export interface DiagnosisFacets {
    image_sufficiency: string;
    component_confidence: number;
    cause_confidence: number;
    [key: string]: unknown;
}

/** Outcome of the Phase 6 commit-vs-clarify rubric. */
export type RecommendedAction = 'commit' | 'ask' | 'commit_low_confidence';

// ─────────────────────────────────────────────────────────────────────────────
// Agent 3 self-critique.
// ─────────────────────────────────────────────────────────────────────────────

export type DiagnosisCritiqueFailureMode =
    | 'none'
    | 'image_quality'
    | 'ambiguous_symptoms'
    | 'taxonomy_gap'
    | 'multi_fault'
    | 'description_unclear'
    | 'prompt_blind_spot'
    | 'low_signal_evidence'
    | 'rubric_miscalibration'
    | 'other';

export interface DiagnosisCritique {
    failure_mode: DiagnosisCritiqueFailureMode;
    confidence_calibration: {
        agent_confidence: number;
        critique_confidence: number;
        delta_reasoning: string;
        rubric_facets_used: string[];
    };
    knowledge_gap: string | null;
    resolution_would_be: string | null;
    considered_alternatives: string[];
    surprise_signals: string[];
    prompt_hypothesis: string | null;
    notes_for_human_review: string;
}
