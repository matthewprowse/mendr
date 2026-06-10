export interface ProvidersRequestBody {
    lat: number;
    lng: number;
    trade: string;
    radius?: number;
    pageToken?: string;
    searchQuery?: string;
    tradeDetail?: string;
    /** Fast path for map-first UX: return eligible providers without slow DB enrich steps. */
    quick?: boolean;
}

export interface ProviderSummaryMeta {
    kind: 'reviews';
    pos: number;
    neg: number;
    neu: number;
}

export interface ProviderService {
    short: string;
    full: string;
}

export interface ProviderItem {
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
    summaryMeta?: ProviderSummaryMeta | null;
    specialisations?: string[];
    isOpen: boolean | null;
    weekdayDescriptions?: string[];
    mendrReviewCount?: number;
    /** ISO timestamp of when this provider last appeared in a match result. Used for recency scoring. */
    lastMatchedAt?: string | null;
    /** Enrichment-derived profile depth score (0..3). */
    profileCompleteness?: number;
    /** Mendr-side Bayesian rating derived from job_outcomes (null when no outcomes yet). */
    mendrRating?: number | null;
    /** Number of Mendr job outcomes contributing to mendrRating. */
    mendrRatingCount?: number | null;
    /** Service area centre latitude (null = no declared service area — serve all). */
    service_area_center_lat?: number | null;
    /** Service area centre longitude. */
    service_area_center_lng?: number | null;
    /** Service area radius in km (null = no declared service area). */
    service_area_radius_km?: number | null;
}

export interface ProvidersResponseBody {
    providers: ProviderItem[];
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
}
