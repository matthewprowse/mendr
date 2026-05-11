export interface DiagnosisData {
    thinking: string;
    diagnosis: string;
    trade: string;
    action_required: string;
    /** Short ZAR job-level summary from the model (Beta). Structured for later comparison to invoices and completed jobs. */
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
     * Used to improve provider match relevance scoring.
     */
    trade_detail?: string;
    /** Agent 2a routing slug from taxonomy (e.g. garage_door_fault). */
    subcategory_id?: string;
    /** 0–100. Below 85: ask for more photos/context before showing providers. */
    confidence?: number;
    /**
     * 2–4 short clarifying statements (from the user's perspective) that the AI
     * needs answered before it can produce a confident diagnosis.
     * Only present when requires_clarification is true.
     * e.g. ["It's a gas geyser", "The issue started after heavy rain"]
     */
    clarification_questions?: string[];
    /**
     * Normalized urgency key from SQL reference data.
     * Links to diagnosis_urgencies.key, e.g. 'immediate', 'urgent', 'soon', 'planned'.
     */
    urgency_key?: string;
    /**
     * Consumer-friendly one-sentence translation of urgency_key for the homeowner.
     * e.g. "Book within the next couple of days before the fault spreads."
     */
    urgency_sentence?: string;
    /**
     * Predicted invoice line-item names for this repair.
     * e.g. ["Call-out fee", "Capacitor replacement", "Labour (1–2 hours)"]
     * Only present when a confident diagnosis was made.
     */
    expected_parts?: string[];
    /**
     * Retail / installed ZAR estimates per {@link expected_parts} line item.
     * Filled after diagnosis via `/api/parts-prices` and persisted on `diagnoses.diagnosis` JSON.
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
     * Written by POST /api/market-rates/research.
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

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    feedback?: 'up' | 'down' | null;
    attachments?: string[];
    /** Stored text descriptions of images (from AI); used for history instead of re-sending image data. */
    attachment_descriptions?: string[];
    hasUpdatedDiagnosis?: boolean;
    /** When present, this assistant message includes a diagnosis (shown as inline response card). */
    diagnosis?: DiagnosisData;
    /** Providers recommended for this message's diagnosis (25+ reviews). */
    providers?: Provider[];
    /** Emerging providers (<25 reviews but good rating), shown in separate section below. */
    emergingProviders?: Provider[];
    /** Nearby providers we don't recommend (low rating/few reviews) but shown for sparse areas. */
    nearbyOnlyProviders?: Provider[];
    /** Pagination: next page token from Google Places for "load more providers". */
    providerNextPageToken?: string | null;
    /** Search query used for this message's provider fetch (required when using pageToken). */
    providerSearchQuery?: string;
}

export interface Service {
    short: string;
    full: string;
}

export interface Provider {
    name: string;
    address: string;
    rating?: number;
    ratingCount?: number;
    phone?: string;
    /** International format for wa.me links */
    phoneInternational?: string;
    website?: string;
    latitude?: number;
    longitude?: number;
    summary: string;
    specialisations?: string[];
    distanceText?: string;
    isOpen?: boolean | null;
    /** Google Place ID for linking to Maps/reviews */
    place_id?: string;
    /** Provider page id (UUID): provider_profiles.id or cached_providers.id for /pro/[id] */
    id?: string | null;
    /** AI-selected favourite: open, 4.5+ rating, 25+ reviews */
    isFavourite?: boolean;
    /** 3-5 sentence explanation of why this provider was selected as the pick */
    favouriteReason?: string;
    /** Google Places photo resource names for the provider */
    photos?: Array<{ name: string }>;
    /** Estimated driving duration, e.g. "12 mins" */
    durationText?: string;
    /** Cached Google reviews (up to 50); used for display and linking to pro page. */
    reviews?: Array<{ text?: string; rating?: number | null; authorName?: string | null; relativePublishTimeDescription?: string | null }>;
    /** Metadata about how the summary was generated. */
    summaryMeta?: { kind: 'reviews'; pos: number; neg: number; neu: number } | null;
}
