import { describe, it, expect } from 'vitest';
import { getInitials, formatReviewDateLabel } from '../review-formatters';

describe('getInitials', () => {
    it('returns the first two initials uppercased', () => {
        expect(getInitials('john smith')).toBe('JS');
    });

    it('returns a single initial for a one-word name', () => {
        expect(getInitials('Cher')).toBe('C');
    });

    it('uses only the first two words for longer names', () => {
        expect(getInitials('Mary Jane Watson')).toBe('MJ');
    });

    it('collapses extra whitespace', () => {
        expect(getInitials('  alice   bob  ')).toBe('AB');
    });

    it('returns an empty string for an empty name', () => {
        expect(getInitials('')).toBe('');
    });
});

describe('formatReviewDateLabel', () => {
    it('returns null for null or undefined', () => {
        expect(formatReviewDateLabel(null)).toBeNull();
        expect(formatReviewDateLabel(undefined)).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(formatReviewDateLabel('')).toBeNull();
    });

    it('returns null for an unparseable date', () => {
        expect(formatReviewDateLabel('not-a-date')).toBeNull();
    });

    it('formats a valid ISO date as DD Mon YYYY', () => {
        expect(formatReviewDateLabel('2026-01-15T10:00:00Z')).toBe('15 Jan 2026');
    });
});
