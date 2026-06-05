import { describe, it, expect } from 'vitest';
import { normalizeSaPhone, isValidSaMobile, formatSaPhoneLocal } from '@/lib/phone';

describe('normalizeSaPhone', () => {
    it('converts a local 0-prefixed number to 27XXXXXXXXX', () => {
        expect(normalizeSaPhone('0821234567')).toBe('27821234567');
    });

    it('strips spaces, dashes, and a leading +', () => {
        expect(normalizeSaPhone('082 123 4567')).toBe('27821234567');
        expect(normalizeSaPhone('082-123-4567')).toBe('27821234567');
        expect(normalizeSaPhone('+27 82 123 4567')).toBe('27821234567');
    });

    it('keeps an already-international 27 number', () => {
        expect(normalizeSaPhone('27821234567')).toBe('27821234567');
    });

    it('assumes SA for a bare 9-digit number', () => {
        expect(normalizeSaPhone('821234567')).toBe('27821234567');
    });

    it('returns null for empty or implausible input', () => {
        expect(normalizeSaPhone('')).toBeNull();
        expect(normalizeSaPhone('abc')).toBeNull();
        expect(normalizeSaPhone('123')).toBeNull();
    });
});

describe('isValidSaMobile', () => {
    it('accepts 06/07/08 mobile prefixes in local and international form', () => {
        expect(isValidSaMobile('0821234567')).toBe(true);
        expect(isValidSaMobile('0731234567')).toBe(true);
        expect(isValidSaMobile('0601234567')).toBe(true);
        expect(isValidSaMobile('+27821234567')).toBe(true);
    });

    it('rejects non-mobile prefixes (e.g. 021 landline)', () => {
        expect(isValidSaMobile('0211234567')).toBe(false);
    });

    it('rejects wrong-length and junk input', () => {
        expect(isValidSaMobile('08212345')).toBe(false);
        expect(isValidSaMobile('not a number')).toBe(false);
        expect(isValidSaMobile('')).toBe(false);
    });
});

describe('formatSaPhoneLocal', () => {
    it('renders a stored 27 number as a local grouped string', () => {
        expect(formatSaPhoneLocal('27821234567')).toBe('082 123 4567');
    });

    it('passes through anything not in 27XXXXXXXXX shape', () => {
        expect(formatSaPhoneLocal('garbage')).toBe('garbage');
    });
});
