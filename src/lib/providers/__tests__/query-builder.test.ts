/**
 * Ported from scripts/test-match-flow.ts — borehole-like detail and canonical
 * service label assertions.
 */
import { describe, it, expect } from 'vitest';
import { buildProviderQuery } from '../query-builder';

describe('buildProviderQuery', () => {
    it('normalises trade and detects borehole-like detail for plumbing', () => {
        const query = buildProviderQuery({
            trade: 'Plumbing',
            tradeDetail: 'Borehole Drilling',
        });
        expect(query.tradeNorm).toBe('plumbing');
        expect(query.isBoreholeLikeDetail).toBe(true);
        expect(query.searchQuery.toLowerCase()).toContain('borehole');
        expect(query.canonicalServiceLabel).toBe('Plumbing');
    });

    it('lowercases the normalised trade for an electrical request', () => {
        const query = buildProviderQuery({ trade: 'Electrical' });
        expect(query.tradeNorm).toBe('electrical');
        expect(query.canonicalServiceLabel).toBe('Electrical');
        expect(query.isBoreholeLikeDetail).toBe(false);
    });

    it('returns a cache-friendly detail key derived from the raw detail', () => {
        const query = buildProviderQuery({
            trade: 'Plumbing',
            tradeDetail: 'Burst Pipe Repair',
        });
        expect(query.detailKeyForCache).toBe('burst_pipe_repair');
    });

    it('returns "none" when no trade detail is supplied', () => {
        const query = buildProviderQuery({ trade: 'Plumbing' });
        expect(query.detailKeyForCache).toBe('none');
    });
});
