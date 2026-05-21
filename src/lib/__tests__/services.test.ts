import { describe, it, expect } from 'vitest';
import { tradeToServiceLabel } from '../services';

describe('tradeToServiceLabel', () => {
    it('returns the canonical label for an exact match (case-insensitive)', () => {
        expect(tradeToServiceLabel('Electrical')).toBe('Electrical');
        expect(tradeToServiceLabel('electrical')).toBe('Electrical');
        expect(tradeToServiceLabel('ELECTRICAL')).toBe('Electrical');
    });

    it('returns canonical label for exact lowercase match', () => {
        expect(tradeToServiceLabel('plumbing')).toBe('Plumbing');
        expect(tradeToServiceLabel('welding')).toBe('Welding');
        expect(tradeToServiceLabel('painting')).toBe('Painting');
    });

    it('returns canonical label for keyword match', () => {
        expect(tradeToServiceLabel('gate motor')).toBe('Security');
        expect(tradeToServiceLabel('garage door')).toBe('Security');
        expect(tradeToServiceLabel('locksmith')).toBe('Locksmith Services');
        expect(tradeToServiceLabel('handyman')).toBe('General Handyman');
    });

    it('matches multi-word canonical label exactly', () => {
        expect(tradeToServiceLabel('Building & Construction')).toBe('Building & Construction');
        expect(tradeToServiceLabel('Flooring & Tiling')).toBe('Flooring & Tiling');
        expect(tradeToServiceLabel('Rubble & Waste Removal')).toBe('Rubble & Waste Removal');
    });

    it('returns null for "N/A"', () => {
        expect(tradeToServiceLabel('N/A')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(tradeToServiceLabel('')).toBeNull();
    });

    it('returns null for null', () => {
        expect(tradeToServiceLabel(null)).toBeNull();
    });

    it('returns null for undefined', () => {
        expect(tradeToServiceLabel(undefined)).toBeNull();
    });

    it('returns null for a string with no keyword match', () => {
        expect(tradeToServiceLabel('xyz unknown trade')).toBeNull();
    });

    it('is case-insensitive for keyword matches', () => {
        expect(tradeToServiceLabel('POOL')).toBe('Pool Maintenance');
        expect(tradeToServiceLabel('Electrician')).toBe('Electrical');
    });

    it('matches longer keyword before shorter when both are substrings', () => {
        // "garage door" should match Security, not just "garage" -> Security (same result)
        expect(tradeToServiceLabel('Garage Door Installation')).toBe('Security');
    });
});
