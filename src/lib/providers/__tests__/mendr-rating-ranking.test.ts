/**
 * Mendr-rating blending in the composite ranker.
 *
 * Day 13: the ranking algorithm previously used only the Google-side
 * rating + count. We now blend a denormalised Mendr-side rating
 * (`providers.mendr_rating`, derived from `job_outcomes`) using a weighted
 * Bayesian average. Mendr ratings are treated as ~2x more credible than
 * Google ratings; they are ignored when fewer than 3 reviews exist (the
 * "New on Mendr" case).
 *
 * These tests guard the score shape, not the absolute numbers — the exact
 * weighting may be re-tuned as we observe real homeowner outcomes.
 */

import { describe, it, expect } from 'vitest';
import { compositeScore } from '../ranking';
import type { ProviderItem } from '../contracts';

function makeProvider(overrides: Partial<ProviderItem> = {}): ProviderItem {
    return {
        placeId: 'provider-mendr',
        name: 'Test Provider',
        address: '',
        rating: 4.0,
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

describe('compositeScore — Mendr rating blending', () => {
    it('matches the Google-only baseline when Mendr fields are absent (back-compat)', () => {
        const a = makeProvider({ rating: 4.5, ratingCount: 50 });
        const b = makeProvider({
            rating: 4.5,
            ratingCount: 50,
            mendrRating: null,
            mendrRatingCount: 0,
        });
        // Both providers must produce identical scores — Mendr=null is a no-op.
        expect(compositeScore(a)).toBeCloseTo(compositeScore(b), 10);
    });

    it('ignores Mendr rating when mendrRatingCount < 3 (insufficient signal)', () => {
        const googleOnly = makeProvider({ rating: 4.0, ratingCount: 50 });
        const withSparseMendr = makeProvider({
            rating: 4.0,
            ratingCount: 50,
            mendrRating: 5.0,
            mendrRatingCount: 2, // below the threshold of 3
        });
        expect(compositeScore(googleOnly)).toBeCloseTo(
            compositeScore(withSparseMendr),
            10,
        );
    });

    it('shifts the score upwards when a strong Mendr rating crosses the threshold', () => {
        const baseline = makeProvider({ rating: 4.0, ratingCount: 50 });
        const withMendr = makeProvider({
            rating: 4.0,
            ratingCount: 50,
            mendrRating: 5.0,
            mendrRatingCount: 5, // >= threshold, all 5★ outcomes
        });
        expect(compositeScore(withMendr)).toBeGreaterThan(compositeScore(baseline));
    });

    it('shifts the score downwards when a poor Mendr rating crosses the threshold', () => {
        const baseline = makeProvider({ rating: 4.5, ratingCount: 50 });
        const withBadMendr = makeProvider({
            rating: 4.5,
            ratingCount: 50,
            mendrRating: 2.0,
            mendrRatingCount: 5,
        });
        expect(compositeScore(withBadMendr)).toBeLessThan(compositeScore(baseline));
    });

    it('high Google + small Mendr count = score stays close to Google baseline', () => {
        // Five Mendr reviews at credibility 2 = 10 phantom Google reviews,
        // against a Google count of 500 — Mendr should barely move the needle.
        const googleHeavy = makeProvider({ rating: 4.8, ratingCount: 500 });
        const blended = makeProvider({
            rating: 4.8,
            ratingCount: 500,
            mendrRating: 3.0, // very different from Google
            mendrRatingCount: 5,
        });
        const drift = Math.abs(compositeScore(googleHeavy) - compositeScore(blended));
        // The 30% rating weight × the (small) blend means the composite barely moves.
        expect(drift).toBeLessThan(0.02);
    });

    it('high Mendr count + low Google rating = score skewed toward Mendr', () => {
        const lowGoogle = makeProvider({ rating: 2.0, ratingCount: 5 });
        const lowGoogleHighMendr = makeProvider({
            rating: 2.0,
            ratingCount: 5,
            mendrRating: 5.0,
            mendrRatingCount: 100, // strong Mendr track record
        });
        // The Mendr signal should pull the composite up significantly.
        expect(compositeScore(lowGoogleHighMendr)).toBeGreaterThan(
            compositeScore(lowGoogle) + 0.05,
        );
    });

    it('all-zeros: null Google rating and no Mendr returns a finite score near the prior', () => {
        const empty = makeProvider({
            rating: null,
            ratingCount: 0,
            mendrRating: null,
            mendrRatingCount: 0,
        });
        const score = compositeScore(empty);
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1.1);
    });
});
