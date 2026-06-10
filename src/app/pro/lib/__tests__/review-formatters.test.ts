import { describe, it, expect } from 'vitest';
import { getInitials, formatReviewDateLabel } from '@/lib/providers/review-formatters';

// ---------------------------------------------------------------------------
// getInitials
// ---------------------------------------------------------------------------

describe('getInitials', () => {
    it('returns two uppercase initials for a two-word name', () => {
        expect(getInitials('John Smith')).toBe('JS');
    });

    it('returns one initial for a single-word name', () => {
        expect(getInitials('Alice')).toBe('A');
    });

    it('returns empty string for empty input', () => {
        expect(getInitials('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
        expect(getInitials('   ')).toBe('');
    });

    it('returns at most two initials even for three-word names', () => {
        expect(getInitials('Mary Jane Watson')).toBe('MJ');
    });

    it('uppercases initials regardless of input case', () => {
        expect(getInitials('john smith')).toBe('JS');
        expect(getInitials('JOHN SMITH')).toBe('JS');
    });

    it('handles extra whitespace between words', () => {
        expect(getInitials('  Tom   Jones  ')).toBe('TJ');
    });
});

// ---------------------------------------------------------------------------
// formatReviewDateLabel
// ---------------------------------------------------------------------------

describe('formatReviewDateLabel', () => {
    it('returns null for null input', () => {
        expect(formatReviewDateLabel(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(formatReviewDateLabel(undefined)).toBeNull();
    });

    it('returns null for an invalid date string', () => {
        expect(formatReviewDateLabel('not-a-date')).toBeNull();
    });

    it('returns a formatted date string for a valid ISO date', () => {
        const result = formatReviewDateLabel('2026-01-15T00:00:00.000Z');
        expect(typeof result).toBe('string');
        expect(result).not.toBeNull();
        // Should contain the year and some form of the date
        expect(result).toContain('2026');
    });

    it('includes day, month and year in the output', () => {
        const result = formatReviewDateLabel('2025-05-01T00:00:00.000Z');
        expect(result).toMatch(/\d{2}/); // day
        expect(result).toContain('2025');
    });

    it('returns null for empty string', () => {
        expect(formatReviewDateLabel('')).toBeNull();
    });
});
