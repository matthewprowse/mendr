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

    it('uses the providedSearchQuery when supplied', () => {
        const query = buildProviderQuery({ trade: 'Electrical', providedSearchQuery: 'Custom electrician Cape Town' });
        expect(query.searchQuery).toBe('Custom electrician Cape Town');
    });

    it('resolves security + gate motor detail to a gate-focused query', () => {
        const query = buildProviderQuery({ trade: 'Security', tradeDetail: 'gate motor repair' });
        expect(query.baseSearchQuery.toLowerCase()).toContain('gate motor');
    });

    it('resolves security + garage door detail to a garage-focused query', () => {
        const query = buildProviderQuery({ trade: 'Security', tradeDetail: 'garage door stuck' });
        expect(query.baseSearchQuery.toLowerCase()).toContain('garage door');
    });

    it('resolves security + intercom detail to intercom query', () => {
        const query = buildProviderQuery({ trade: 'Security', tradeDetail: 'broken intercom' });
        expect(query.baseSearchQuery.toLowerCase()).toContain('intercom');
    });

    it('resolves security with no specific detail to generic gate/garage query', () => {
        const query = buildProviderQuery({ trade: 'Security' });
        expect(query.baseSearchQuery.toLowerCase()).toContain('gate');
    });

    it('overrides roofing detail to roofing contractor query', () => {
        const query = buildProviderQuery({ trade: 'General Handyman', tradeDetail: 'roof leak repair' });
        expect(query.baseSearchQuery).toContain('Roofing');
    });

    it('returns null canonicalServiceLabel for an unknown trade', () => {
        const query = buildProviderQuery({ trade: 'Unknown Trade XYZ' });
        expect(query.canonicalServiceLabel).toBeNull();
    });

    it('truncates detailKeyForCache to 48 chars', () => {
        const longDetail = 'a very long trade detail that exceeds forty eight characters for sure';
        const query = buildProviderQuery({ trade: 'Electrical', tradeDetail: longDetail });
        expect(query.detailKeyForCache.length).toBeLessThanOrEqual(48);
    });
});
