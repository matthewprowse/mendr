export interface DiagnosisData {
    thinking: string;
    diagnosis: string;
    trade: string;
    action_required: string;
    estimated_cost: string;
    message?: string;
    rejected?: boolean;
    requires_clarification?: boolean;
    /** 0–100. Below 85: ask for more photos/context before showing providers. */
    confidence?: number;
}

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    feedback?: 'up' | 'down' | null;
    attachments?: string[];
    hasUpdatedDiagnosis?: boolean;
    /** When present, this assistant message includes a diagnosis (shown as inline response card). */
    diagnosis?: DiagnosisData;
    /** Providers recommended for this message's diagnosis (25+ reviews). */
    providers?: Provider[];
    /** Emerging providers (<25 reviews but good rating), shown in separate section below. */
    emergingProviders?: Provider[];
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
    /** AI-selected favourite: open, 4.5+ rating, 25+ reviews */
    isFavourite?: boolean;
    /** 3-5 sentence explanation of why this provider was selected as the pick */
    favouriteReason?: string;
}
