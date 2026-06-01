import { describe, it, expect } from 'vitest';
import { compositeScore, rankProviders, getISOWeekKey } from '../ranking';
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
