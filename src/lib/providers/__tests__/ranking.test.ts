import { describe, it, expect } from 'vitest';
import { compositeScore, rankProviders, getISOWeekKey, isProviderInServiceArea, haversineKm, PROVIDER_RATING_FLOOR } from '../ranking';
import type { ProviderItem } from '../contracts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
// compositeScore
// ---------------------------------------------------------------------------

describe('compositeScore', () => {
    it('returns a number between 0 and 1.1 for a typical provider', () => {
        const score = compositeScore(makeProvider());
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1.1);
    });

    it('scores a nearby specialist higher than a distant generalist', () => {
        const specialist = makeProvider({
            name: 'Cape Town Plumbing Expert',
            distanceKm: 2,
            rating: 4.5,
            ratingCount: 40,
            specialisations: ['burst pipe', 'geyser'],
        });
        const generalist = makeProvider({
            name: 'General Services',
            distanceKm: 10,
            rating: 4.0,
            ratingCount: 10,
            specialisations: [],
        });
        const specScore = compositeScore(specialist, 'burst pipe', 'Plumbing');
        const genScore = compositeScore(generalist, 'burst pipe', 'Plumbing');
        expect(specScore).toBeGreaterThan(genScore);
    });

    it('returns higher score for provider with more reviews (Bayesian smoothing)', () => {
        const manyReviews = makeProvider({ rating: 4.5, ratingCount: 100 });
        const fewReviews = makeProvider({ rating: 4.5, ratingCount: 2 });
        expect(compositeScore(manyReviews)).toBeGreaterThan(compositeScore(fewReviews));
    });

    it('handles null rating gracefully', () => {
        const provider = makeProvider({ rating: null });
        const score = compositeScore(provider);
        expect(typeof score).toBe('number');
        expect(Number.isFinite(score)).toBe(true);
    });

    it('handles null distanceKm gracefully', () => {
        const provider = makeProvider({ distanceKm: null });
        const score = compositeScore(provider);
        expect(typeof score).toBe('number');
        expect(Number.isFinite(score)).toBe(true);
    });

    it('returns neutral relevance when no trade context provided', () => {
        const score = compositeScore(makeProvider());
        expect(score).toBeGreaterThan(0);
    });

    it('awards completeness bonus for fully complete profiles', () => {
        const complete = makeProvider({ profileCompleteness: 3 });
        const incomplete = makeProvider({ profileCompleteness: 0 });
        expect(compositeScore(complete)).toBeGreaterThan(compositeScore(incomplete));
    });

    it('demotes bare profiles (completeness 0) below minimally-enriched ones', () => {
        // A completeness=0 provider takes a real penalty, while completeness=1
        // only loses the bonus — the gap should exceed the 0.01 sort threshold.
        const bare = makeProvider({ profileCompleteness: 0 });
        const minimal = makeProvider({ profileCompleteness: 1 });
        expect(compositeScore(minimal) - compositeScore(bare)).toBeGreaterThan(0.01);
    });
});

// ---------------------------------------------------------------------------
// rankProviders
// ---------------------------------------------------------------------------

describe('rankProviders', () => {
    it('returns an empty array for empty input', () => {
        expect(rankProviders([])).toEqual([]);
    });

    it('returns at most `limit` providers', () => {
        const providers = Array.from({ length: 10 }, (_, i) =>
            makeProvider({ placeId: `p-${i}`, name: `Provider ${i}` })
        );
        const result = rankProviders(providers, 3);
        expect(result).toHaveLength(3);
    });

    it('returns all providers when count is below limit', () => {
        const providers = [makeProvider({ placeId: 'a' }), makeProvider({ placeId: 'b' })];
        expect(rankProviders(providers, 6)).toHaveLength(2);
    });

    it('sorts providers by score descending', () => {
        const best = makeProvider({
            placeId: 'best',
            rating: 5.0,
            ratingCount: 200,
            distanceKm: 1,
            specialisations: ['electrical', 'db board'],
        });
        const worst = makeProvider({
            placeId: 'worst',
            rating: 2.0,
            ratingCount: 2,
            distanceKm: 14,
            specialisations: [],
        });
        const result = rankProviders([worst, best], 6, { trade: 'Electrical', tradeDetail: 'db board' });
        expect(result[0].placeId).toBe('best');
    });

    it('does not mutate the input array', () => {
        const providers = [
            makeProvider({ placeId: 'a', distanceKm: 10 }),
            makeProvider({ placeId: 'b', distanceKm: 1 }),
        ];
        const original = [...providers];
        rankProviders(providers, 6);
        expect(providers.map((p) => p.placeId)).toEqual(original.map((p) => p.placeId));
    });
});

// ---------------------------------------------------------------------------
// haversineKm
// ---------------------------------------------------------------------------

describe('haversineKm', () => {
    it('returns 0 for identical coordinates', () => {
        expect(haversineKm(-33.9, 18.4, -33.9, 18.4)).toBeCloseTo(0, 5);
    });

    it('returns ~1.11 km for 0.01 degree latitude difference near Cape Town', () => {
        const d = haversineKm(-33.9, 18.4, -33.91, 18.4);
        expect(d).toBeGreaterThan(1.0);
        expect(d).toBeLessThan(1.2);
    });
});

// ---------------------------------------------------------------------------
// isProviderInServiceArea
// ---------------------------------------------------------------------------

describe('isProviderInServiceArea', () => {
    it('returns true when provider has no declared service area', () => {
        const p = makeProvider({ service_area_center_lat: null, service_area_center_lng: null, service_area_radius_km: null });
        expect(isProviderInServiceArea(p, -33.9, 18.4)).toBe(true);
    });

    it('returns true when customer is within the service radius', () => {
        const p = makeProvider({
            service_area_center_lat: -33.9,
            service_area_center_lng: 18.4,
            service_area_radius_km: 10,
        });
        // Customer ~0 km away
        expect(isProviderInServiceArea(p, -33.9, 18.4)).toBe(true);
    });

    it('returns false when customer is outside the service radius', () => {
        const p = makeProvider({
            service_area_center_lat: -33.9,
            service_area_center_lng: 18.4,
            service_area_radius_km: 1, // tight 1 km radius
        });
        // Customer ~111 km away (1 degree latitude difference)
        expect(isProviderInServiceArea(p, -34.9, 18.4)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// rankProviders — additional branches
// ---------------------------------------------------------------------------

describe('rankProviders — additional coverage', () => {
    it('filters out providers rated below the floor (e.g. 3.0)', () => {
        const low = makeProvider({ placeId: 'low', rating: PROVIDER_RATING_FLOOR - 0.1 });
        const ok = makeProvider({ placeId: 'ok', rating: 4.5 });
        const result = rankProviders([low, ok]);
        expect(result.map((p) => p.placeId)).not.toContain('low');
        expect(result.map((p) => p.placeId)).toContain('ok');
    });

    it('keeps unrated providers (rating=null) regardless of floor', () => {
        const unrated = makeProvider({ placeId: 'new', rating: null });
        const result = rankProviders([unrated]);
        expect(result.map((p) => p.placeId)).toContain('new');
    });

    it('applies service-area filter when customer coordinates are provided', () => {
        const nearby = makeProvider({
            placeId: 'nearby',
            service_area_center_lat: -33.9,
            service_area_center_lng: 18.4,
            service_area_radius_km: 50,
        });
        const distant = makeProvider({
            placeId: 'distant',
            service_area_center_lat: -25.0,
            service_area_center_lng: 28.0,
            service_area_radius_km: 10, // Johannesburg area, strict radius
        });
        const result = rankProviders([nearby, distant], 6, { customerLat: -33.9, customerLng: 18.4 });
        expect(result.map((p) => p.placeId)).toContain('nearby');
        expect(result.map((p) => p.placeId)).not.toContain('distant');
    });

    it('skips service-area filter when only one coordinate is provided', () => {
        const p = makeProvider({ placeId: 'p1' });
        // Only lat provided — filter should be skipped, provider should appear
        const result = rankProviders([p], 6, { customerLat: -33.9 });
        expect(result).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// compositeScore — Mendr rating blending and recency branches
// ---------------------------------------------------------------------------

describe('compositeScore — Mendr rating and recency', () => {
    it('raises the score when a provider has a high Mendr rating with sufficient count', () => {
        const withMendr = makeProvider({ placeId: 'with-mendr', rating: 4.0, ratingCount: 10, mendrRating: 5.0, mendrRatingCount: 5 });
        const noMendr = makeProvider({ placeId: 'no-mendr', rating: 4.0, ratingCount: 10, mendrRating: null, mendrRatingCount: null });
        expect(compositeScore(withMendr)).toBeGreaterThan(compositeScore(noMendr));
    });

    it('ignores Mendr rating when mendrRatingCount < 3', () => {
        const fewMendr = makeProvider({ placeId: 'few', rating: 4.0, ratingCount: 10, mendrRating: 5.0, mendrRatingCount: 2 });
        const noMendr = makeProvider({ placeId: 'none', rating: 4.0, ratingCount: 10, mendrRating: null, mendrRatingCount: null });
        // Scores should be equal since the Mendr signal is suppressed below threshold
        expect(compositeScore(fewMendr)).toBeCloseTo(compositeScore(noMendr), 6);
    });

    it('gives a higher score to a recently-active provider vs a dormant one', () => {
        const recent = makeProvider({ placeId: 'recent', ...(({ lastMatchedAt: new Date().toISOString() } as unknown) as Partial<ProviderItem>) });
        const dormant = makeProvider({ placeId: 'dormant', ...(({ lastMatchedAt: new Date(Date.now() - 200 * 86_400_000).toISOString() } as unknown) as Partial<ProviderItem>) });
        expect(compositeScore(recent)).toBeGreaterThan(compositeScore(dormant));
    });
});

// ---------------------------------------------------------------------------
// getISOWeekKey
// ---------------------------------------------------------------------------

describe('getISOWeekKey', () => {
    it('returns a string in YYYY-Www format', () => {
        const key = getISOWeekKey(new Date('2026-01-05'));
        expect(key).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('returns consistent output for the same date', () => {
        const d = new Date('2026-03-15');
        expect(getISOWeekKey(d)).toBe(getISOWeekKey(d));
    });

    it('returns different keys for dates in different ISO weeks', () => {
        const a = getISOWeekKey(new Date('2026-01-05')); // W02
        const b = getISOWeekKey(new Date('2026-01-12')); // W03
        expect(a).not.toBe(b);
    });

    it('uses current date when no argument provided', () => {
        const key = getISOWeekKey();
        expect(key).toMatch(/^\d{4}-W\d{2}$/);
    });
});
