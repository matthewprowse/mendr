import { describe, it, expect } from 'vitest';
import { formatWeekdayDescriptionsTo24h } from '../format-weekday-descriptions';

describe('formatWeekdayDescriptionsTo24h', () => {
    it('returns null for non-array input', () => {
        expect(formatWeekdayDescriptionsTo24h('nope')).toBeNull();
        expect(formatWeekdayDescriptionsTo24h(null)).toBeNull();
    });

    it('returns null when no lines produce output', () => {
        expect(formatWeekdayDescriptionsTo24h([])).toBeNull();
        expect(formatWeekdayDescriptionsTo24h(['', '   '])).toBeNull();
    });

    it('converts AM/PM times to 24-hour format', () => {
        expect(formatWeekdayDescriptionsTo24h(['Monday: 9:00 AM – 5:00 PM'])).toEqual([
            'Monday: 09:00 - 17:00',
        ]);
    });

    it('handles a bare hour with meridiem (12 PM)', () => {
        expect(formatWeekdayDescriptionsTo24h(['Tuesday: 12 PM - 8 PM'])).toEqual([
            'Tuesday: 12:00 - 20:00',
        ]);
    });

    it('handles 12 AM as midnight', () => {
        expect(formatWeekdayDescriptionsTo24h(['Wednesday: 12 AM - 6 AM'])).toEqual([
            'Wednesday: 00:00 - 06:00',
        ]);
    });

    it('recognises Closed days', () => {
        expect(formatWeekdayDescriptionsTo24h(['Sunday: Closed'])).toEqual(['Sunday: Closed']);
    });

    it('recognises 24-hour openings', () => {
        expect(formatWeekdayDescriptionsTo24h(['Saturday: Open 24 hours'])).toEqual([
            'Saturday: Open 24 Hours',
        ]);
    });

    it('normalises abbreviated day names to canonical form', () => {
        expect(formatWeekdayDescriptionsTo24h(['Fri - Closed'])).toEqual(['Friday: Closed']);
    });

    it('leaves an unrecognised day label unchanged', () => {
        expect(formatWeekdayDescriptionsTo24h(['Funday: Closed'])).toEqual(['Funday: Closed']);
    });

    it('returns a line with no day/hours delimiter verbatim', () => {
        expect(formatWeekdayDescriptionsTo24h(['Open all week'])).toEqual(['Open all week']);
    });

    it('skips non-string entries', () => {
        expect(formatWeekdayDescriptionsTo24h([123, 'Monday: Closed'])).toEqual([
            'Monday: Closed',
        ]);
    });
});
