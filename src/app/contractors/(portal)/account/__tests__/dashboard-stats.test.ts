import { describe, it, expect } from 'vitest';
import { computeMonthRange } from '../dashboard-stats';

describe('computeMonthRange', () => {
    it('returns the start-of-month and start-of-next-month for a mid-month UTC date', () => {
        const now = new Date('2026-05-15T10:30:00.000Z');
        const range = computeMonthRange(now);
        expect(range.startIso).toBe('2026-05-01T00:00:00.000Z');
        expect(range.endIso).toBe('2026-06-01T00:00:00.000Z');
    });

    it('handles year rollover from December to January', () => {
        const now = new Date('2026-12-31T23:59:59.000Z');
        const range = computeMonthRange(now);
        expect(range.startIso).toBe('2026-12-01T00:00:00.000Z');
        expect(range.endIso).toBe('2027-01-01T00:00:00.000Z');
    });

    it('treats the very first instant of a month as that month', () => {
        const now = new Date('2026-05-01T00:00:00.000Z');
        const range = computeMonthRange(now);
        expect(range.startIso).toBe('2026-05-01T00:00:00.000Z');
        expect(range.endIso).toBe('2026-06-01T00:00:00.000Z');
    });

    it('handles February in a non-leap year', () => {
        const now = new Date('2026-02-10T12:00:00.000Z');
        const range = computeMonthRange(now);
        expect(range.startIso).toBe('2026-02-01T00:00:00.000Z');
        expect(range.endIso).toBe('2026-03-01T00:00:00.000Z');
    });

    it('handles February in a leap year (boundary is still March 1st)', () => {
        const now = new Date('2028-02-29T12:00:00.000Z');
        const range = computeMonthRange(now);
        expect(range.startIso).toBe('2028-02-01T00:00:00.000Z');
        expect(range.endIso).toBe('2028-03-01T00:00:00.000Z');
    });

    it('uses UTC and is unaffected by the host timezone offset', () => {
        // 23:30 UTC on 31 May = 01:30 SAST on 1 June, but the UTC-based month
        // is still May.
        const now = new Date('2026-05-31T23:30:00.000Z');
        const range = computeMonthRange(now);
        expect(range.startIso).toBe('2026-05-01T00:00:00.000Z');
        expect(range.endIso).toBe('2026-06-01T00:00:00.000Z');
    });

    it('endIso is strictly greater than startIso', () => {
        const now = new Date('2026-01-15T00:00:00.000Z');
        const { startIso, endIso } = computeMonthRange(now);
        expect(new Date(endIso).getTime()).toBeGreaterThan(new Date(startIso).getTime());
    });
});
