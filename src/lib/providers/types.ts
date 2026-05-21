/**
 * Shared UI-facing provider types used across the app.
 *
 * These types represent the display model for a provider as consumed by the
 * chat, diagnosis, match, and contractor pages. They are distinct from
 * {@link ProviderItem} (the internal handler type in contracts.ts) and
 * {@link MatchProvider} (the richer match-feature API type in features/match).
 *
 * Import from here — not from `@/app/chat/components/types`.
 */

/** Short and long service label pair, e.g. { short: "Elec", full: "Electrical" }. */
export interface Service {
    short: string;
    full: string;
}

/** Display model for a recommended provider returned by the diagnosis pipeline. */
export interface Provider {
    name: string;
    address: string;
    rating?: number;
    ratingCount?: number;
    phone?: string;
    /** International format (E.164 without +) for wa.me links, e.g. "27821234567". */
    phoneInternational?: string;
    website?: string;
    latitude?: number;
    longitude?: number;
    summary: string;
    specialisations?: string[];
    distanceText?: string;
    isOpen?: boolean | null;
    /** Google Place ID for linking to Maps or the reviews page. */
    place_id?: string;
    /** Provider page id (UUID): `provider_profiles.id` or `cached_providers.id`. */
    id?: string | null;
    /** AI-selected favourite: open, 4.5+ rating, 25+ reviews. */
    isFavourite?: boolean;
    /** 3–5 sentence explanation of why this provider was selected as the top pick. */
    favouriteReason?: string;
    /** Google Places photo resource names for the provider. */
    photos?: Array<{ name: string }>;
    /** Estimated driving duration, e.g. "12 mins". */
    durationText?: string;
    /** Cached Google reviews (up to 50). */
    reviews?: Array<{
        text?: string;
        rating?: number | null;
        authorName?: string | null;
        relativePublishTimeDescription?: string | null;
    }>;
    /** Metadata about how the provider summary was generated. */
    summaryMeta?: { kind: 'reviews'; pos: number; neg: number; neu: number } | null;
}
