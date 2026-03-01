/**
 * Areas and trades to scrape for provider cache pre-population.
 * Similar to how Uber/Lyft pre-warm their place data: define geographic cells,
 * search each for service providers, cache results to reduce API calls at request time.
 *
 * By default uses a grid covering the whole Western Cape. Overlap is fine; cache dedupes by place_id.
 */

export interface ScrapeArea {
    /** Display name for logging */
    name: string;
    lat: number;
    lng: number;
    /** Search radius in metres (e.g. 25000 = 25km, 50000 = 50km) */
    radiusM: number;
}

/** Western Cape bounding box (approx). Lat/lng in degrees. */
const WESTERN_CAPE = {
    latMin: -34.95,
    latMax: -31.5,
    lngMin: 17.4,
    lngMax: 24.5,
} as const;

/** Grid step in degrees (~0.35° ≈ 39 km). Cells overlap with radius so coverage is complete. */
const GRID_STEP_DEGREES = 0.35;
const CELL_RADIUS_M = 40_000;

/** Generate a grid of cells covering the whole Western Cape. */
export function getWesternCapeGrid(): ScrapeArea[] {
    const areas: ScrapeArea[] = [];
    let i = 0;
    for (let lat = WESTERN_CAPE.latMin; lat <= WESTERN_CAPE.latMax; lat += GRID_STEP_DEGREES) {
        for (let lng = WESTERN_CAPE.lngMin; lng <= WESTERN_CAPE.lngMax; lng += GRID_STEP_DEGREES) {
            areas.push({
                name: `WC-${++i}`,
                lat: Math.round(lat * 100) / 100,
                lng: Math.round(lng * 100) / 100,
                radiusM: CELL_RADIUS_M,
            });
        }
    }
    return areas;
}

/** Areas to scrape: full Western Cape grid. */
export const SCRAPE_AREAS: ScrapeArea[] = getWesternCapeGrid();
