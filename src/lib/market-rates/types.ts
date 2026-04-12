export type MarketRatesIntent =
    | 'callout_visit'
    | 'typical_labour_band'
    | 'parts_retail'
    /** Second-pass broad web query when primary templates return few items. */
    | 'fallback_broad';

export type MarketRateSource = {
    url: string;
    title: string;
    snippet: string;
    intent: MarketRatesIntent;
    fetched_at: string;
};

export type MarketRatesRefinedCosts = {
    estimated_cost?: string;
};

/** Bump when query shape or cache semantics change (invalidates all `market_rates_cache` rows). */
export const MARKET_RATES_QUERY_VERSION = 7;

/** Default TTL: 14 days (pricing moves slower than provider carousel). */
export const MARKET_RATES_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** After a live CSE fetch returns zero usable links, retry sooner (keys fixed, engine scope, etc.). */
export const MARKET_RATES_EMPTY_FETCH_TTL_MS = 60 * 60 * 1000;

/** Max Brave Search API requests per market-rates research run (primary + fallback share this budget). */
export const MAX_BRAVE_WEB_CALLS = 3;
