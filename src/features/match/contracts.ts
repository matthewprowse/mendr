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
};

export type GeocodeRequest = {
    lat?: number;
    lng?: number;
    address?: string;
};

export type GeocodeResponse = {
    lat?: number;
    lng?: number;
    address?: string;
    error?: string;
};
