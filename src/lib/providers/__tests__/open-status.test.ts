import { describe, it, expect } from 'vitest';
import {
    isOpenNowFromWeekdayDescriptions,
    getOpenStatusTextFromWeekdayDescriptions,
} from '../open-status';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Standard Mon–Fri 09:00–17:00, weekend closed.
const WORK_WEEK = [
    'Monday: 09:00 - 17:00',
    'Tuesday: 09:00 - 17:00',
    'Wednesday: 09:00 - 17:00',
    'Thursday: 09:00 - 17:00',
    'Friday: 09:00 - 17:00',
    'Saturday: Closed',
    'Sunday: Closed',
];

// Dates pinned at *local* clock time. JS Date(year, monthIndex, day, hour, min)
// uses local timezone. Day-of-week uses local timezone too. These fixtures
// therefore exercise the function's day-boundary logic in whatever runtime TZ
// the suite runs in — that's correct because the function reads getDay()/
// getHours() directly.

// Mon 2026-01-05 10:00 local
const MON_10AM = new Date(2026, 0, 5, 10, 0);
// Mon 2026-01-05 08:59 local — before open
const MON_BEFORE_OPEN = new Date(2026, 0, 5, 8, 59);
// Mon 2026-01-05 17:00 local — exactly closing time (inclusive)
const MON_AT_CLOSE = new Date(2026, 0, 5, 17, 0);
// Mon 2026-01-05 17:01 local — just past close
const MON_AFTER_CLOSE = new Date(2026, 0, 5, 17, 1);
// Sun 2026-01-04 12:00 local — closed day
const SUN_NOON = new Date(2026, 0, 4, 12, 0);

// ---------------------------------------------------------------------------
// isOpenNowFromWeekdayDescriptions
// ---------------------------------------------------------------------------

describe('isOpenNowFromWeekdayDescriptions', () => {
    it('returns true mid-morning on a weekday', () => {
        expect(isOpenNowFromWeekdayDescriptions(WORK_WEEK, MON_10AM)).toBe(true);
    });

    it('returns false before opening time', () => {
        expect(isOpenNowFromWeekdayDescriptions(WORK_WEEK, MON_BEFORE_OPEN)).toBe(false);
    });

    it('returns true exactly at closing time (inclusive end)', () => {
        expect(isOpenNowFromWeekdayDescriptions(WORK_WEEK, MON_AT_CLOSE)).toBe(true);
    });

    it('returns false one minute past closing', () => {
        expect(isOpenNowFromWeekdayDescriptions(WORK_WEEK, MON_AFTER_CLOSE)).toBe(false);
    });

    it('returns false on a closed day (Sunday: Closed)', () => {
        expect(isOpenNowFromWeekdayDescriptions(WORK_WEEK, SUN_NOON)).toBe(false);
    });

    it('returns null when weekdayDescriptions is not an array', () => {
        expect(isOpenNowFromWeekdayDescriptions(null, MON_10AM)).toBe(null);
        expect(isOpenNowFromWeekdayDescriptions(undefined, MON_10AM)).toBe(null);
        expect(isOpenNowFromWeekdayDescriptions('Monday: 09:00 - 17:00', MON_10AM)).toBe(null);
    });

    it('returns null when the day is missing entirely', () => {
        const partial = ['Tuesday: 09:00 - 17:00'];
        expect(isOpenNowFromWeekdayDescriptions(partial, MON_10AM)).toBe(null);
    });

    it('returns true when day is "Open 24 hours"', () => {
        const all24 = DAYS.map((d) => `${d}: Open 24 hours`);
        expect(isOpenNowFromWeekdayDescriptions(all24, MON_BEFORE_OPEN)).toBe(true);
        expect(isOpenNowFromWeekdayDescriptions(all24, SUN_NOON)).toBe(true);
    });

    it('returns true when day is "24 hours"', () => {
        const lines = DAYS.map((d) => `${d}: 24 hours`);
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(true);
    });

    it('supports unicode en/em dashes between times', () => {
        const lines = DAYS.map((d) => `${d}: 09:00 – 17:00`); // en dash
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(true);
        const em = DAYS.map((d) => `${d}: 09:00 — 17:00`); // em dash
        expect(isOpenNowFromWeekdayDescriptions(em, MON_10AM)).toBe(true);
    });

    it('supports multiple ranges (split shift)', () => {
        const lines = DAYS.map((d) => `${d}: 09:00 - 12:00, 13:00 - 17:00`);
        // 10:00 first range
        expect(isOpenNowFromWeekdayDescriptions(lines, new Date(2026, 0, 5, 10, 0))).toBe(true);
        // 12:30 lunch gap
        expect(isOpenNowFromWeekdayDescriptions(lines, new Date(2026, 0, 5, 12, 30))).toBe(false);
        // 14:00 second range
        expect(isOpenNowFromWeekdayDescriptions(lines, new Date(2026, 0, 5, 14, 0))).toBe(true);
    });

    it('supports overnight ranges (22:00 - 02:00)', () => {
        const lines = DAYS.map((d) => `${d}: 22:00 - 02:00`);
        // 23:30 — inside the late portion
        expect(isOpenNowFromWeekdayDescriptions(lines, new Date(2026, 0, 5, 23, 30))).toBe(true);
        // 01:00 — inside the early-morning portion (interpreted on same day per impl)
        expect(isOpenNowFromWeekdayDescriptions(lines, new Date(2026, 0, 5, 1, 0))).toBe(true);
        // 10:00 — closed gap
        expect(isOpenNowFromWeekdayDescriptions(lines, new Date(2026, 0, 5, 10, 0))).toBe(false);
    });

    it('returns false when the range is unparseable', () => {
        const lines = DAYS.map((d) => `${d}: gibberish`);
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(false);
    });

    it('accepts hyphen-separated format with no leading "Day:"', () => {
        // The parser requires `Day: ...` or `Day - ...`; this exercises the dash variant.
        const lines = DAYS.map((d) => `${d} - 09:00 - 17:00`);
        // Day is parsed; "09:00 - 17:00" should be the hoursPart.
        // First "- 09:00 - 17:00" — the regex captures everything after the first ` - ` so
        // hoursPart becomes "09:00 - 17:00", which is valid.
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(true);
    });

    it('ignores entries with no day prefix', () => {
        const lines = ['just a comment', 'Monday: 09:00 - 17:00'];
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(true);
    });

    it('handles day names case-insensitively', () => {
        const lines = ['monday: 09:00 - 17:00'];
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(true);
    });

    it('handles short day names (Mon, Tue, etc.)', () => {
        const lines = ['Mon: 09:00 - 17:00'];
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(true);
    });

    it('skips non-string entries', () => {
        const mixed = [123, null, 'Monday: 09:00 - 17:00', { foo: 'bar' }] as unknown[];
        expect(isOpenNowFromWeekdayDescriptions(mixed, MON_10AM)).toBe(true);
    });

    it('rejects out-of-range times in HH:MM (e.g. 25:00)', () => {
        const lines = DAYS.map((d) => `${d}: 25:00 - 27:00`);
        // No valid ranges parsed -> closed
        expect(isOpenNowFromWeekdayDescriptions(lines, MON_10AM)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getOpenStatusTextFromWeekdayDescriptions
// ---------------------------------------------------------------------------

describe('getOpenStatusTextFromWeekdayDescriptions', () => {
    it('returns { isOpen: true, nextOpensAt: null } when currently open', () => {
        expect(
            getOpenStatusTextFromWeekdayDescriptions(WORK_WEEK, MON_10AM),
        ).toEqual({ isOpen: true, nextOpensAt: null });
    });

    it('returns isOpen=false with same-day opening time when before open', () => {
        const result = getOpenStatusTextFromWeekdayDescriptions(WORK_WEEK, MON_BEFORE_OPEN);
        expect(result).toEqual({ isOpen: false, nextOpensAt: '09:00' });
    });

    it('returns isOpen=false and skips closed days to find next opening', () => {
        // Saturday afternoon — should skip Sat closed, Sun closed, and report Monday's 09:00
        const sat = new Date(2026, 0, 3, 14, 0); // Sat 2026-01-03
        const result = getOpenStatusTextFromWeekdayDescriptions(WORK_WEEK, sat);
        expect(result).toEqual({ isOpen: false, nextOpensAt: '09:00' });
    });

    it('returns isOpen=true when 24h day is found', () => {
        const lines = DAYS.map((d) => `${d}: Open 24 hours`);
        expect(getOpenStatusTextFromWeekdayDescriptions(lines, MON_10AM)).toEqual({
            isOpen: true,
            nextOpensAt: null,
        });
    });

    it('returns { isOpen: null } when weekdayDescriptions is missing/invalid', () => {
        expect(getOpenStatusTextFromWeekdayDescriptions(null, MON_10AM)).toEqual({
            isOpen: null,
            nextOpensAt: null,
        });
    });

    it('returns isOpen=false with null nextOpensAt when no future opening exists', () => {
        const allClosed = DAYS.map((d) => `${d}: Closed`);
        expect(getOpenStatusTextFromWeekdayDescriptions(allClosed, MON_10AM)).toEqual({
            isOpen: false,
            nextOpensAt: null,
        });
    });

    it('pads the opening time to HH:MM correctly (e.g. 07:30)', () => {
        const lines = DAYS.map((d) => `${d}: 07:30 - 16:00`);
        const result = getOpenStatusTextFromWeekdayDescriptions(lines, new Date(2026, 0, 5, 6, 0));
        expect(result).toEqual({ isOpen: false, nextOpensAt: '07:30' });
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];
