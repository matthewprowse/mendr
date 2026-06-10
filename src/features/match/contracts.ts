export type MatchLocation = {
    lat: number;
    lng: number;
    address: string;
};

export type MatchProviderCompanySize = 'solo' | 'small' | 'mid' | 'large';

export type MatchProviderCertification = {
    slug: string;
    label: string;
    /** Short label suitable for compact card chips (e.g. "ECB"). */
    short?: string;
};

export type MatchProviderImage = {
    url: string;
    caption?: string;
};

export type MatchProvider = {
    placeId: string;
    place_id?: string;
    providerId?: string;
    name: string;
    address: string;
    rating: number | null;
    ratingCount: number;
    latitude: number | null;
    longitude: number | null;
    distanceKm: number | null;
    durationText: string;
    website: string | null;
    phone: string | null;
    summary: string;
    summaryMeta?: { kind: 'reviews'; pos: number; neg: number; neu: number } | null;
    services?: { short: string; full: string }[];
    mendrReviewCount?: number;
    isOpen?: boolean | null;
    weekdayDescriptions?: string[];
    // Enrichment fields (populated from provider_cache after background enrichment)
    bio?: string | null;
    specialisations?: string[];
    hasWorkPhotos?: boolean;
    enrichmentReviewSummary?: string | null;
    responseProfile?: string | null;
    profileCompleteness?: number;
    // Filter v2 fields (populated from providers + provider_certifications + provider_images)
    companySize?: MatchProviderCompanySize | null;
    yearsInBusiness?: number | null;
    certifications?: MatchProviderCertification[];
    images?: MatchProviderImage[];
    /**
     * True when the specialist's identity is withheld because the homeowner is
     * not signed in with a verified number. Name and contact are stripped
     * server-side; the card renders a locked state and gates profile/contact.
     */
    identityLocked?: boolean;
};

export type ProvidersRequest = {
    lat: number;
    lng: number;
    trade: string;
    tradeDetail?: string;
    radius?: number;
    pageToken?: string;
    searchQuery?: string;
    quick?: boolean;
};

export type ProvidersResponse = {
    providers: MatchProvider[];
    nextPageToken?: string | null;
    searchQuery?: string;
    tradeDetail?: string | null;
    debugTiming?: {
        totalMs: number;
        stages: Record<string, number>;
        searchCacheHit: boolean;
        placesCount: number;
        providersCount: number;
    };
    error?: string;
    /** Set when Google Places returns a transient error (e.g. 503). */
    code?: string;
};

export type GeocodeRequest = {
    lat?: number;
    lng?: number;
    address?: string;
    /** When true, only accept results in the Western Cape, South Africa (onboard / ops). */
    westernCapeOnly?: boolean;
};

export type GeocodeResponse = {
    lat?: number;
    lng?: number;
    address?: string;
    error?: string;
};

/**
 * Full contractor profile for the `/pro/[id]` page.
 *
 * Superset of `MatchProvider` plus long-form copy and contractor-only fields
 * (gallery, key person, weekday descriptions, etc.). Returned by GET
 * `/api/providers/[id]` and consumed by `useContractor`.
 */
export type ContractorProfile = MatchProvider & {
    googlePlaceId: string | null;
    bio: string | null;
    about: string | null;
    pastWork: string | null;
    summaryLong: string | null;
    highlights: string[];
    serviceAreas: string[];
    /** "HH:mm" in the provider's local time when closed; null when open or unknown. */
    nextOpensAt: string | null;
};

/**
 * Cached enrichment data for a single Google Place ID.
 * Returned by POST /api/enrich/get and consumed by the match page client + cache layer.
 * Defined here (not in the route file) because it's a cross-module contract.
 */
export interface EnrichmentCacheEntry {
    googlePlaceId: string;
    bio: string | null;
    specialisations: string[];
    hasWorkPhotos: boolean;
    reviewSummary: string | null;
    /** True when fast path deliberately skipped AI (not enough DB reviews); do not keep polling. */
    fastSummaryInsufficient?: boolean;
    responseProfile: string | null;
    websiteQuality: string | null;
    enrichedAt: string | null;
    profileCompleteness: number;
    cacheVersion: number;
}

