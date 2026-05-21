import { describe, it, expect } from 'vitest';
import { dayOrder, normalizeDay, parseWeekdayDescriptions } from '@/lib/providers/provider-hours';

// ---------------------------------------------------------------------------
// dayOrder
// ---------------------------------------------------------------------------

describe('dayOrder', () => {
    it('contains all 7 days of the week', () => {
        expect(dayOrder).toHaveLength(7);
    });

    it('starts with Monday and ends with Sunday', () => {
        expect(dayOrder[0]).toBe('Monday');
        expect(dayOrder[6]).toBe('Sunday');
    });

    it('contains each weekday exactly once', () => {
        const set = new Set(dayOrder);
        expect(set.size).toBe(7);
    });
});

// ---------------------------------------------------------------------------
// normalizeDay
// ---------------------------------------------------------------------------

describe('normalizeDay', () => {
    it('returns null for empty string', () => {
        expect(normalizeDay('')).toBeNull();
    });

    it('normalizes "Mon" to "Monday"', () => {
        expect(normalizeDay('Mon')).toBe('Monday');
    });

    it('normalizes "monday" (lowercase) to "Monday"', () => {
        expect(normalizeDay('monday')).toBe('Monday');
    });

    it('normalizes "MONDAY" to "Monday"', () => {
        expect(normalizeDay('MONDAY')).toBe('Monday');
    });

    it('normalizes "Tue" to "Tuesday"', () => {
        expect(normalizeDay('Tue')).toBe('Tuesday');
    });

    it('normalizes "Wed" to "Wednesday"', () => {
        expect(normalizeDay('Wed')).toBe('Wednesday');
    });

    it('normalizes "Thu" to "Thursday"', () => {
        expect(normalizeDay('Thu')).toBe('Thursday');
    });

    it('normalizes "Fri" to "Friday"', () => {
        expect(normalizeDay('Fri')).toBe('Friday');
    });

    it('normalizes "Sat" to "Saturday"', () => {
        expect(normalizeDay('Sat')).toBe('Saturday');
    });

    it('normalizes "Sun" to "Sunday"', () => {
        expect(normalizeDay('Sun')).toBe('Sunday');
    });

    it('returns null for an unrecognised day string', () => {
        expect(normalizeDay('Blah')).toBeNull();
    });

    it('handles leading/trailing whitespace', () => {
        expect(normalizeDay('  Monday  ')).toBe('Monday');
    });
});

// ---------------------------------------------------------------------------
// parseWeekdayDescriptions
// ---------------------------------------------------------------------------

describe('parseWeekdayDescriptions', () => {
    it('returns empty object for non-array input', () => {
        expect(parseWeekdayDescriptions(null)).toEqual({});
        expect(parseWeekdayDescriptions(undefined)).toEqual({});
        expect(parseWeekdayDescriptions('string')).toEqual({});
        expect(parseWeekdayDescriptions(42)).toEqual({});
    });

    it('returns empty object for empty array', () => {
        expect(parseWeekdayDescriptions([])).toEqual({});
    });

    it('parses a simple colon-separated line', () => {
        const result = parseWeekdayDescriptions(['Monday: 08:00 – 17:00']);
        expect(result).toEqual({ Monday: '08:00 – 17:00' });
    });

    it('parses a dash-separated line', () => {
        const result = parseWeekdayDescriptions(['Tuesday - 09:00 to 18:00']);
        expect(result).toEqual({ Tuesday: '09:00 to 18:00' });
    });

    it('parses multiple days', () => {
        const result = parseWeekdayDescriptions([
            'Monday: 08:00 – 17:00',
            'Saturday: 09:00 – 13:00',
            'Sunday: Closed',
        ]);
        expect(result.Monday).toBe('08:00 – 17:00');
        expect(result.Saturday).toBe('09:00 – 13:00');
        expect(result.Sunday).toBe('Closed');
    });

    it('skips non-string entries', () => {
        const result = parseWeekdayDescriptions([42, null, 'Monday: 08:00 – 17:00']);
        expect(result).toEqual({ Monday: '08:00 – 17:00' });
    });

    it('skips lines that do not match the pattern', () => {
        const result = parseWeekdayDescriptions(['open all day', 'Monday: 08:00 – 17:00']);
        expect(Object.keys(result)).toEqual(['Monday']);
    });

    it('normalises abbreviated day names', () => {
        const result = parseWeekdayDescriptions(['Mon: 08:00 – 17:00']);
        expect(result.Monday).toBe('08:00 – 17:00');
    });
});
