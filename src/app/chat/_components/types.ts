export interface DiagnosisData {
    thinking: string;
    diagnosis: string;
    trade: string;
    action_required: string;
    estimated_cost: string;
    /** @deprecated Call-out is now calculated from distance on report view. */
    callout_fee?: string;
    /** @deprecated Use repair_cost_range and replacement_cost_range. */
    repair_or_replacement_fee?: string;
    /** Repair cost range, e.g. 'R800–R1,200'. */
    repair_cost_range?: string;
    /** Replacement cost range, e.g. 'R2,000–R5,000'. */
    replacement_cost_range?: string;
    /** Equipment and parts cost range, e.g. 'R200–R500'. */
    equipment_parts_range?: string;
    message?: string;
    rejected?: boolean;
    requires_clarification?: boolean;
    /** True when the need is home-related but we don't offer that service yet. */
    unserviced?: boolean;
    /** 0–100. Below 85: ask for more photos/context before showing providers. */
    confidence?: number;
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
    /** Nearby providers we don't recommend (low rating/few reviews) but shown for sparse areas; includes reviewConcerns. */
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
    services: Service[];
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
    /** For nearby-only / non-recommended providers: key things to look out for from reviews (why reviews are low). */
    reviewConcerns?: string;
    /** Cached Google reviews (up to 50); used for display and linking to pro page. */
    reviews?: Array<{ text?: string; rating?: number | null; authorName?: string | null; relativePublishTimeDescription?: string | null }>;
}
