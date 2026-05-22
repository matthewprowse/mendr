/**
 * Ported from scripts/test-match-flow.ts — search cache key shape.
 */
import { describe, it, expect } from 'vitest';
import { buildSearchCacheKey } from '../cache';

describe('buildSearchCacheKey', () => {
    it('rounds lat/lng to 3dp and embeds trade+detail+radius', () => {
        const key = buildSearchCacheKey({
            lat: -33.912345,
            lng: 18.412345,
            tradeNorm: 'plumbing',
            detailKeyForCache: 'borehole',
            radius: 25000,
        });
        expect(key).toContain('plumbing_borehole_25000');
        expect(key).toContain('-33.912');
        expect(key).toContain('18.412');
    });

    it('produces identical keys for inputs within 3dp of each other', () => {
        const a = buildSearchCacheKey({
            lat: -33.9123,
            lng: 18.4123,
            tradeNorm: 'electrical',
            detailKeyForCache: 'db_board',
            radius: 10000,
        });
        const b = buildSearchCacheKey({
            lat: -33.9124,
            lng: 18.4124,
            tradeNorm: 'electrical',
            detailKeyForCache: 'db_board',
            radius: 10000,
        });
        expect(a).toBe(b);
    });

    it('starts with the `search_` prefix', () => {
        const key = buildSearchCacheKey({
            lat: 0,
            lng: 0,
            tradeNorm: 'painting',
            detailKeyForCache: 'none',
            radius: 5000,
        });
        expect(key.startsWith('search_')).toBe(true);
    });
});
