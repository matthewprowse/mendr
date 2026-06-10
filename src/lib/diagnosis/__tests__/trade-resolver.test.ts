import { describe, it, expect } from 'vitest';
import { resolveCanonicalTrade } from '@/lib/diagnosis/trade-resolver';

describe('resolveCanonicalTrade', () => {
    it('returns null for empty, whitespace, nullish, and N/A input', () => {
        expect(resolveCanonicalTrade(null)).toBeNull();
        expect(resolveCanonicalTrade(undefined)).toBeNull();
        expect(resolveCanonicalTrade('')).toBeNull();
        expect(resolveCanonicalTrade('   ')).toBeNull();
        expect(resolveCanonicalTrade('n/a')).toBeNull();
        expect(resolveCanonicalTrade('N/A')).toBeNull();
    });

    it('passes an exact canonical label through (case-insensitive)', () => {
        expect(resolveCanonicalTrade('Plumbing')).toBe('Plumbing');
        expect(resolveCanonicalTrade('plumbing')).toBe('Plumbing');
    });

    it('resolves a trade-noun synonym to its canonical label', () => {
        expect(resolveCanonicalTrade('plumber')).toBe('Plumbing');
    });

    it('resolves a fault description to a canonical trade', () => {
        expect(resolveCanonicalTrade('burst pipe in the wall')).toBe('Plumbing');
    });

    it('returns null for text that matches no label or anchor', () => {
        expect(resolveCanonicalTrade('zzzqqq nonsense')).toBeNull();
    });
});
