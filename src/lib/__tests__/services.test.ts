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

    // Real-world rejection cases (2026-05-23 gate-spring incident).
    it('maps garage door spring and tilt-door keywords to Security', () => {
        expect(tradeToServiceLabel('garage spring')).toBe('Security');
        expect(tradeToServiceLabel('torsion spring')).toBe('Security');
        expect(tradeToServiceLabel('extension spring')).toBe('Security');
        expect(tradeToServiceLabel('up and over door')).toBe('Security');
        expect(tradeToServiceLabel('tilt door')).toBe('Security');
        expect(tradeToServiceLabel('canopy door')).toBe('Security');
    });

    it('maps roller shutter keywords to Security', () => {
        expect(tradeToServiceLabel('roller shutter')).toBe('Security');
        expect(tradeToServiceLabel('roller shutters')).toBe('Security');
        expect(tradeToServiceLabel('shutter door')).toBe('Security');
        expect(tradeToServiceLabel('Roller Shutter Repair')).toBe('Security');
    });

    it('maps gate hardware keywords to Security', () => {
        expect(tradeToServiceLabel('gate track')).toBe('Security');
        expect(tradeToServiceLabel('gate roller')).toBe('Security');
        expect(tradeToServiceLabel('gate hinge')).toBe('Security');
        expect(tradeToServiceLabel('gate arm')).toBe('Security');
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
