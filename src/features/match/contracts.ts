export type MatchLocation = {
    lat: number;
    lng: number;
    address: string;
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
    scandioReviewCount?: number;
    isOpen?: boolean | null;
    weekdayDescriptions?: string[];
    // Enrichment fields (populated from provider_cache after background enrichment)
    bio?: string | null;
    specialisations?: string[];
    hasWorkPhotos?: boolean;
    enrichmentReviewSummary?: string | null;
    responseProfile?: string | null;
    profileCompleteness?: number;
};

export type ProvidersRequest = {
    lat: number;
    lng: number;
    trade: string;
    tradeDetail?: string;
    radius?: number;
    pageToken?: string;
    searchQuery?: string;
};

export type ProvidersResponse = {
    providers: MatchProvider[];
    nextPageToken?: string | null;
    searchQuery?: string;
    tradeDetail?: string | null;
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
