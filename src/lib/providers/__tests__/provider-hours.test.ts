import { describe, it, expect } from 'vitest';
import { dayOrder, normalizeDay, parseWeekdayDescriptions } from '../provider-hours';

describe('dayOrder', () => {
    it('lists the seven days Monday through Sunday', () => {
        expect(dayOrder).toEqual([
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday',
        ]);
    });
});

describe('normalizeDay', () => {
    it('returns null for empty input', () => {
        expect(normalizeDay('')).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
        expect(normalizeDay('   ')).toBeNull();
    });

    it('maps abbreviated prefixes to the canonical day', () => {
        expect(normalizeDay('Mon')).toBe('Monday');
        expect(normalizeDay('tues')).toBe('Tuesday');
        expect(normalizeDay('WED')).toBe('Wednesday');
        expect(normalizeDay('thur')).toBe('Thursday');
        expect(normalizeDay('Fri')).toBe('Friday');
        expect(normalizeDay('sat')).toBe('Saturday');
        expect(normalizeDay('sun')).toBe('Sunday');
    });

    it('returns null for an unrecognised day', () => {
        expect(normalizeDay('Funday')).toBeNull();
    });
});

describe('parseWeekdayDescriptions', () => {
    it('returns an empty object for non-array input', () => {
        expect(parseWeekdayDescriptions('not an array')).toEqual({});
        expect(parseWeekdayDescriptions(null)).toEqual({});
        expect(parseWeekdayDescriptions(undefined)).toEqual({});
    });

    it('parses colon-delimited day lines', () => {
        expect(
            parseWeekdayDescriptions(['Monday: 09:00 - 17:00', 'Tuesday: 09:00 - 17:00'])
        ).toEqual({ Monday: '09:00 - 17:00', Tuesday: '09:00 - 17:00' });
    });

    it('parses dash-delimited day lines', () => {
        expect(parseWeekdayDescriptions(['Wed - Closed'])).toEqual({ Wednesday: 'Closed' });
    });

    it('skips non-string entries', () => {
        expect(parseWeekdayDescriptions([42, { day: 'Monday' }, 'Friday: 08:00'])).toEqual({
            Friday: '08:00',
        });
    });

    it('skips blank lines', () => {
        expect(parseWeekdayDescriptions(['', '   ', 'Sat: 10:00'])).toEqual({ Saturday: '10:00' });
    });

    it('skips lines with no parseable hours', () => {
        expect(parseWeekdayDescriptions(['Monday'])).toEqual({});
    });

    it('skips lines whose day cannot be normalised', () => {
        expect(parseWeekdayDescriptions(['Funday: 09:00'])).toEqual({});
    });
});
