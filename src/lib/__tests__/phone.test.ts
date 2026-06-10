import { describe, it, expect } from 'vitest';
import {
    normalizeSaPhone,
    isValidSaMobile,
    formatSaPhoneLocal,
    formatSaPhoneInput,
} from '@/lib/phone';

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

describe('formatSaPhoneInput', () => {
    it('groups a full local number as 0XX XXX XXXX', () => {
        expect(formatSaPhoneInput('0821234567')).toBe('082 123 4567');
    });

    it('drops a +27 or 27 international prefix', () => {
        expect(formatSaPhoneInput('+27821234567')).toBe('082 123 4567');
        expect(formatSaPhoneInput('27821234567')).toBe('082 123 4567');
    });

    it('groups progressively as the user types', () => {
        expect(formatSaPhoneInput('08')).toBe('08');
        expect(formatSaPhoneInput('082')).toBe('082');
        expect(formatSaPhoneInput('0821')).toBe('082 1');
        expect(formatSaPhoneInput('082123')).toBe('082 123');
        expect(formatSaPhoneInput('0821234')).toBe('082 123 4');
    });

    it('ignores non-digits and caps at nine national digits', () => {
        expect(formatSaPhoneInput('082-123-4567')).toBe('082 123 4567');
        expect(formatSaPhoneInput('0821234567890')).toBe('082 123 4567');
    });

    it('returns an empty string when there are no digits', () => {
        expect(formatSaPhoneInput('')).toBe('');
        expect(formatSaPhoneInput('abc')).toBe('');
    });
});
