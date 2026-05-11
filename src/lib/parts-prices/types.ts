/** Single cached price result for one part. */
export interface PartPrice {
    part_name: string;
    /** Trade used as the variant discriminator, e.g. "Security & Access". */
    variant: string;
    price_min: number | null;
    price_max: number | null;
    /** Formatted ZAR range, e.g. "R150–R350", or null when unknown. */
    price_display: string | null;
    from_cache: boolean;
}

/** Request body for POST /api/parts-prices. */
export interface PartsPricesRequest {
    parts: string[];
    trade: string;
    trade_detail?: string;
    /** Defaults to "cape_town" when absent. */
    region_key?: string;
}

/** Response from POST /api/parts-prices. */
export interface PartsPricesResponse {
    results: PartPrice[];
}

/** Bump to invalidate all cached rows. */
export const PARTS_PRICE_QUERY_VERSION = 2;

/** 14-day TTL (2 weeks) in milliseconds. */
export const PARTS_PRICE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Shorter TTL for empty results — retry sooner rather than caching failures for 2 weeks. */
export const PARTS_PRICE_EMPTY_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
