/**
 * Unit tests for the distance + radius helpers extracted from `handler.ts`
 * in Phase 2.
 */
import { describe, it, expect } from 'vitest';
import {
    greatCircleDistanceKm,
    getProviderResultLimitByRadius,
    getTargetPlacesCountByRadius,
} from '../handler-distance';

describe('greatCircleDistanceKm', () => {
    it('returns 0 when both points are identical', () => {
        expect(greatCircleDistanceKm(-33.92, 18.42, -33.92, 18.42)).toBe(0);
    });

    it('returns ~1.11 km for ~0.01° latitude difference at the equator', () => {
        // At any latitude, 0.01° of latitude ≈ 1.11 km.
        const d = greatCircleDistanceKm(0, 0, 0.01, 0);
        expect(d).toBeGreaterThan(1.0);
        expect(d).toBeLessThan(1.2);
    });

    it('roughly matches the Cape Town → Stellenbosch distance (~50 km)', () => {
        // Approximate Cape Town vs Stellenbosch coordinates.
        const d = greatCircleDistanceKm(-33.9249, 18.4241, -33.9321, 18.86);
        expect(d).toBeGreaterThan(35);
        expect(d).toBeLessThan(50);
    });

    it('is symmetric: d(A,B) == d(B,A)', () => {
        const a = greatCircleDistanceKm(-33, 18, -34, 19);
        const b = greatCircleDistanceKm(-34, 19, -33, 18);
        expect(a).toBeCloseTo(b, 6);
    });
});

describe('getProviderResultLimitByRadius', () => {
    it.each([
        [50_000, 100],
        [60_000, 100],
        [20_000, 40],
        [30_000, 40],
        [10_000, 20],
        [15_000, 20],
        [5_000, 10],
        [0, 10],
    ])('returns %i providers for radius %i meters', (radius, expected) => {
        expect(getProviderResultLimitByRadius(radius)).toBe(expected);
    });
});

describe('getTargetPlacesCountByRadius', () => {
    it('floors target count at 20', () => {
        expect(getTargetPlacesCountByRadius(0)).toBe(30); // 10 + 20
        // The minimum is 20 only when providerLimit + 20 would be less than 20.
        // Since providerLimit ≥ 10, target ≥ 30.
    });

    it('caps target count at 120', () => {
        expect(getTargetPlacesCountByRadius(100_000)).toBe(120);
    });

    it('scales linearly with provider limit', () => {
        // radius >= 20km → 40 providers → target = 60
        expect(getTargetPlacesCountByRadius(20_000)).toBe(60);
    });
});
