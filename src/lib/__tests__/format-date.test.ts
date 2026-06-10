import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatRelativeDate, formatLongDate } from '@/lib/format-date';

const norm = (s: string) => s.replace(/\s+/gu, ' ');

describe('formatRelativeDate', () => {
    // Pin "now" so the relative buckets are deterministic.
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    });
    afterAll(() => {
        vi.useRealTimers();
    });

    it('returns Today for under a day ago', () => {
        expect(formatRelativeDate('2026-06-15T08:00:00Z')).toBe('Today');
    });

    it('returns Yesterday for one day ago', () => {
        expect(formatRelativeDate('2026-06-14T00:00:00Z')).toBe('Yesterday');
    });

    it('returns N Days Ago for two to six days', () => {
        expect(formatRelativeDate('2026-06-12T12:00:00Z')).toBe('3 Days Ago');
        expect(formatRelativeDate('2026-06-09T12:00:00Z')).toBe('6 Days Ago');
    });

    it('returns a day-month string for older dates in the current year', () => {
        expect(norm(formatRelativeDate('2026-05-01T12:00:00Z'))).toBe('01 May');
    });

    it('includes the year for dates in a previous year', () => {
        expect(norm(formatRelativeDate('2020-03-05T12:00:00Z'))).toBe('05 Mar 2020');
    });

    it('returns an empty string for invalid input', () => {
        expect(formatRelativeDate('')).toBe('');
        expect(formatRelativeDate('not-a-date')).toBe('');
    });
});

describe('formatLongDate', () => {
    it('formats a valid date as a long human string', () => {
        // Weekday is locale/timezone-sensitive; assert the stable shape and parts.
        const out = formatLongDate('2026-05-30T12:00:00Z');
        expect(out).toMatch(/^[A-Za-z]+, \d{1,2} May 2026$/);
    });

    it('returns an empty string for invalid input', () => {
        expect(formatLongDate('')).toBe('');
        expect(formatLongDate('not-a-date')).toBe('');
    });
});
