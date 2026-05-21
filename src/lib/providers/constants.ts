/** Search cache row TTL for provider_search_cache hits. */
export const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Rolling window for review text and age filters (approx 24 months). */
export const TWENTY_FOUR_MONTHS_MS = 24 * 30 * 24 * 60 * 60 * 1000;

/** Extra Google text search pages to fetch when the first page is thin (non-pagination). */
export const TEXT_SEARCH_MAX_EXTRA_PAGES = 4;

/** When to re-fetch Google reviews for persistence (reviews_synced_at staleness). */
export const REVIEW_SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Filter out retail / big-box stores from contractor-style results. */
export const RETAIL_TYPES = new Set<string>([
    'hardware_store',
    'home_goods_store',
    'home_improvement_store',
    'building_materials_store',
    'department_store',
    'warehouse_store',
    'discount_store',
]);
