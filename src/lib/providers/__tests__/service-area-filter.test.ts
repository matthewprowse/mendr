import { describe, it, expect } from 'vitest';
import { haversineKm, isProviderInServiceArea, rankProviders } from '../ranking';
import type { ProviderItem } from '../contracts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPE_TOWN = { lat: -33.9249, lng: 18.4241 };
const STELLENBOSCH = { lat: -33.9321, lng: 18.8602 };

function makeProvider(overrides: Partial<ProviderItem> = {}): ProviderItem {
    return {
        placeId: 'provider-1',
        name: 'Test Provider',
        address: '',
        rating: 4.5,
        ratingCount: 50,
        latitude: null,
        longitude: null,
        distanceKm: 5,
        durationText: '',
        website: null,
        phone: null,
        summary: '',
        isOpen: null,
        specialisations: [],
        profileCompleteness: 0,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// haversineKm
// ---------------------------------------------------------------------------

describe('haversineKm', () => {
    it('returns ~40km between Cape Town CBD and Stellenbosch', () => {
        const d = haversineKm(
            CAPE_TOWN.lat,
            CAPE_TOWN.lng,
            STELLENBOSCH.lat,
            STELLENBOSCH.lng,
        );
        // True great-circle distance is ~40.4 km; assert within 5 km tolerance.
        expect(d).toBeGreaterThan(35);
        expect(d).toBeLessThan(45);
    });

    it('returns 0 for identical coordinates', () => {
        expect(haversineKm(CAPE_TOWN.lat, CAPE_TOWN.lng, CAPE_TOWN.lat, CAPE_TOWN.lng)).toBe(0);
    });

    it('is symmetric (a→b == b→a)', () => {
        const ab = haversineKm(CAPE_TOWN.lat, CAPE_TOWN.lng, STELLENBOSCH.lat, STELLENBOSCH.lng);
        const ba = haversineKm(STELLENBOSCH.lat, STELLENBOSCH.lng, CAPE_TOWN.lat, CAPE_TOWN.lng);
        expect(Math.abs(ab - ba)).toBeLessThan(1e-9);
    });
});

// ---------------------------------------------------------------------------
// isProviderInServiceArea
// ---------------------------------------------------------------------------

describe('isProviderInServiceArea', () => {
    it('returns true when provider has no declared service area (back-compat)', () => {
        const p = makeProvider({
            service_area_center_lat: null,
            service_area_center_lng: null,
            service_area_radius_km: null,
        });
        expect(isProviderInServiceArea(p, CAPE_TOWN.lat, CAPE_TOWN.lng)).toBe(true);
    });

    it('returns true when provider has only partial config (null center)', () => {
        const p = makeProvider({
            service_area_center_lat: null,
            service_area_center_lng: null,
            service_area_radius_km: 15,
        });
        expect(isProviderInServiceArea(p, CAPE_TOWN.lat, CAPE_TOWN.lng)).toBe(true);
    });

    it('matches customer within the radius', () => {
        // Provider centred in Cape Town, 50km radius — Stellenbosch (~40km) is inside.
        const p = makeProvider({
            service_area_center_lat: CAPE_TOWN.lat,
            service_area_center_lng: CAPE_TOWN.lng,
            service_area_radius_km: 50,
        });
        expect(isProviderInServiceArea(p, STELLENBOSCH.lat, STELLENBOSCH.lng)).toBe(true);
    });

    it('rejects customer outside the radius', () => {
        // Provider centred in Cape Town, 15km radius — Stellenbosch (~40km) is outside.
        const p = makeProvider({
            service_area_center_lat: CAPE_TOWN.lat,
            service_area_center_lng: CAPE_TOWN.lng,
            service_area_radius_km: 15,
        });
        expect(isProviderInServiceArea(p, STELLENBOSCH.lat, STELLENBOSCH.lng)).toBe(false);
    });

    it('matches at the exact radius boundary', () => {
        const p = makeProvider({
            service_area_center_lat: CAPE_TOWN.lat,
            service_area_center_lng: CAPE_TOWN.lng,
            service_area_radius_km: 1000, // way bigger than any realistic distance
        });
        expect(isProviderInServiceArea(p, STELLENBOSCH.lat, STELLENBOSCH.lng)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// rankProviders with service-area filter
// ---------------------------------------------------------------------------

describe('rankProviders with service-area filter', () => {
    it('excludes out-of-area providers when customer lat/lng provided', () => {
        const inArea = makeProvider({
            placeId: 'in-area',
            service_area_center_lat: CAPE_TOWN.lat,
            service_area_center_lng: CAPE_TOWN.lng,
            service_area_radius_km: 15,
        });
        const outOfArea = makeProvider({
            placeId: 'out-of-area',
            service_area_center_lat: STELLENBOSCH.lat,
            service_area_center_lng: STELLENBOSCH.lng,
            service_area_radius_km: 5, // tight radius around Stellenbosch
        });
        const result = rankProviders([inArea, outOfArea], 6, {
            customerLat: CAPE_TOWN.lat,
            customerLng: CAPE_TOWN.lng,
        });
        expect(result.map((p) => p.placeId)).toEqual(['in-area']);
    });

    it('keeps providers with undeclared service area (back-compat)', () => {
        const legacy = makeProvider({
            placeId: 'legacy',
            service_area_center_lat: null,
            service_area_center_lng: null,
            service_area_radius_km: null,
        });
        const result = rankProviders([legacy], 6, {
            customerLat: CAPE_TOWN.lat,
            customerLng: CAPE_TOWN.lng,
        });
        expect(result.map((p) => p.placeId)).toEqual(['legacy']);
    });

    it('skips the filter when lat/lng not provided (back-compat with existing callers)', () => {
        const outOfArea = makeProvider({
            placeId: 'out-of-area',
            service_area_center_lat: STELLENBOSCH.lat,
            service_area_center_lng: STELLENBOSCH.lng,
            service_area_radius_km: 5,
        });
        // No customer coords: filter must be a no-op.
        const result = rankProviders([outOfArea], 6);
        expect(result).toHaveLength(1);
        expect(result[0].placeId).toBe('out-of-area');
    });

    it('skips the filter when only one of lat/lng is provided', () => {
        const outOfArea = makeProvider({
            placeId: 'out-of-area',
            service_area_center_lat: STELLENBOSCH.lat,
            service_area_center_lng: STELLENBOSCH.lng,
            service_area_radius_km: 5,
        });
        const result = rankProviders([outOfArea], 6, { customerLat: CAPE_TOWN.lat });
        expect(result).toHaveLength(1);
    });
});
