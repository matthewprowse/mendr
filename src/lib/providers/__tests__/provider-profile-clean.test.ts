import { describe, it, expect } from 'vitest';
import {
    sanitizeProfileText,
    isLowSignalProfileText,
    normalizeProfileTextForStorage,
} from '@/lib/providers/provider-profile-clean';

describe('sanitizeProfileText', () => {
    it('returns an empty string for nullish or empty input', () => {
        expect(sanitizeProfileText(null)).toBe('');
        expect(sanitizeProfileText(undefined)).toBe('');
        expect(sanitizeProfileText('')).toBe('');
    });

    it('decodes common HTML entities', () => {
        expect(sanitizeProfileText('Bob &amp; Sons')).toBe('Bob & Sons');
        expect(sanitizeProfileText('Bob&nbsp;Smith')).toBe('Bob Smith');
    });

    it('strips HTML tags', () => {
        expect(sanitizeProfileText('<p>Hello world</p>')).toBe('Hello world');
        expect(sanitizeProfileText('Bob &amp; Sons <b>Plumbing</b>')).toBe(
            'Bob & Sons Plumbing',
        );
    });

    it('drops cookie-banner noise and very short lines', () => {
        expect(sanitizeProfileText('We accept all cookies\nReal plumbing content here')).toBe(
            'Real plumbing content here',
        );
        expect(sanitizeProfileText('Hi\nProper plumbing services')).toBe(
            'Proper plumbing services',
        );
    });

    it('de-duplicates repeated lines case-insensitively', () => {
        expect(sanitizeProfileText('Great service\ngreat service\nFast work')).toBe(
            'Great service\nFast work',
        );
    });

    it('caps the output length', () => {
        const long = 'Quality plumbing work. '.repeat(200);
        expect(sanitizeProfileText(long).length).toBeLessThanOrEqual(1800);
    });
});

describe('isLowSignalProfileText', () => {
    it('flags empty text', () => {
        expect(isLowSignalProfileText('')).toBe(true);
    });

    it('flags scraper tag-name artefacts', () => {
        expect(isLowSignalProfileText('div\nli\nsome content')).toBe(true);
        expect(
            isLowSignalProfileText('div plumbing div service div repair div work div fix'),
        ).toBe(true);
    });

    it('passes genuine profile copy', () => {
        expect(
            isLowSignalProfileText(
                'We are a professional plumbing company serving Cape Town with quality workmanship',
            ),
        ).toBe(false);
    });
});

describe('normalizeProfileTextForStorage', () => {
    it('returns null for empty or low-signal input', () => {
        expect(normalizeProfileTextForStorage(null)).toBeNull();
        expect(
            normalizeProfileTextForStorage(
                'div plumbing div service div repair div work div fix',
            ),
        ).toBeNull();
    });

    it('returns the cleaned text for genuine copy', () => {
        expect(
            normalizeProfileTextForStorage(
                'Professional plumbing services in Cape Town for over twenty years',
            ),
        ).toBe('Professional plumbing services in Cape Town for over twenty years');
    });
});
