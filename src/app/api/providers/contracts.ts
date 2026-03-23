export interface ProvidersRequestBody {
    lat: number;
    lng: number;
    trade: string;
    radius?: number;
    pageToken?: string;
    searchQuery?: string;
    tradeDetail?: string;
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
    services: ProviderService[];
    isOpen: boolean | null;
    weekdayDescriptions?: string[];
    scandioReviewCount?: number;
}

export interface ProvidersResponseBody {
    providers: ProviderItem[];
    nextPageToken?: string | null;
    searchQuery?: string;
    tradeDetail?: string | null;
}
