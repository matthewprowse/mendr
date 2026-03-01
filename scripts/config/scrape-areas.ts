/**
 * Areas and trades to scrape for provider cache pre-population.
 * Similar to how Uber/Lyft pre-warm their place data: define geographic cells,
 * search each for service providers, cache results to reduce API calls at request time.
 *
 * Add/modify areas as needed. Radius in metres (50km = 50000).
 */

export interface ScrapeArea {
    /** Display name for logging */
    name: string;
    lat: number;
    lng: number;
    /** Search radius in metres (e.g. 25000 = 25km, 50000 = 50km) */
    radiusM: number;
}

/** Western Cape towns/cities – centres with radius. Overlap is fine; cache dedupes by place_id. */
export const SCRAPE_AREAS: ScrapeArea[] = [
    { name: 'Cape Town CBD', lat: -33.9249, lng: 18.4241, radiusM: 15000 },
    { name: 'Cape Town Northern Suburbs', lat: -33.8942, lng: 18.5172, radiusM: 20000 },
    { name: 'Cape Town Southern Suburbs', lat: -34.0351, lng: 18.4504, radiusM: 20000 },
    { name: 'Cape Town West Coast', lat: -33.8, lng: 18.45, radiusM: 25000 },
    { name: 'Stellenbosch', lat: -33.9321, lng: 18.8602, radiusM: 20000 },
    { name: 'Paarl', lat: -33.7342, lng: 18.9611, radiusM: 20000 },
    { name: 'Franschhoek', lat: -33.9133, lng: 19.1244, radiusM: 15000 },
    { name: 'Wellington', lat: -33.6392, lng: 19.0085, radiusM: 20000 },
    { name: 'George', lat: -33.9887, lng: 22.4536, radiusM: 25000 },
    { name: 'Knysna', lat: -34.0351, lng: 23.0462, radiusM: 20000 },
    { name: 'Mossel Bay', lat: -34.1833, lng: 22.1333, radiusM: 20000 },
    { name: 'Hermanus', lat: -34.4187, lng: 19.2345, radiusM: 15000 },
    { name: 'Somerset West', lat: -34.0833, lng: 18.85, radiusM: 20000 },
    { name: 'Durbanville', lat: -33.8333, lng: 18.65, radiusM: 15000 },
    { name: 'Bellville', lat: -33.9, lng: 18.6333, radiusM: 15000 },
    { name: 'Constantia', lat: -34.0167, lng: 18.4167, radiusM: 15000 },
    { name: 'Worcester', lat: -33.6461, lng: 19.4489, radiusM: 25000 },
    { name: 'Robertson', lat: -33.8033, lng: 19.8833, radiusM: 20000 },
    { name: 'Caledon', lat: -34.2333, lng: 19.4167, radiusM: 20000 },
    { name: 'Langebaan', lat: -33.05, lng: 18.0333, radiusM: 15000 },
];

/** Trades to search (must match providers API TRADE_QUERY_MAP keys) */
export const SCRAPE_TRADES = [
    'plumber',
    'electrician',
    'handyman',
    'painter',
    'carpenter',
    'roofer',
    'locksmith',
    'pool',
    'builder',
    'garage door',
    'gate repair',
    'air conditioning',
    'flooring & tiling',
    'welding',
] as const;
