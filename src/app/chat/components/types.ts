// DiagnosisData now lives in its canonical location; re-exported here for
// backward compatibility with chat-layer components.
export type { DiagnosisData } from '@/features/diagnosis/types';

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
    /** Provider page id (UUID): provider_profiles.id or cached_providers.id for /contractors/[id] */
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
