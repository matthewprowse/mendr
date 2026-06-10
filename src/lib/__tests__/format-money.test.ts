import { describe, it, expect } from 'vitest';
import { formatZar } from '@/lib/format-money';

// en-ZA renders a space thousands separator (a non-breaking variant) and a
// comma decimal, e.g. "R 1 234,56". Normalise any whitespace to a plain space
// so assertions do not depend on the exact separator codepoint.
const norm = (s: string) => s.replace(/\s+/gu, ' ');

describe('formatZar', () => {
    it('always prefixes "R " and shows two decimals', () => {
        expect(formatZar(0)).toBe('R 0,00');
        expect(formatZar(99.99)).toBe('R 99,99');
        expect(formatZar(2.5)).toBe('R 2,50');
    });

    it('groups thousands', () => {
        expect(norm(formatZar(1234.56))).toBe('R 1 234,56');
        expect(norm(formatZar(1000000))).toBe('R 1 000 000,00');
    });

    it('handles negatives', () => {
        expect(formatZar(-100)).toBe('R -100,00');
    });

    it('falls back to zero for non-finite input', () => {
        expect(formatZar(NaN)).toBe('R 0,00');
        expect(formatZar(Infinity)).toBe('R 0,00');
        expect(formatZar(-Infinity)).toBe('R 0,00');
    });
});
