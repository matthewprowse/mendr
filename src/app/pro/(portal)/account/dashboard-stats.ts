/**
 * Pure helpers for the contractor dashboard stats.
 *
 * Months are computed in UTC to match how Supabase stores `timestamptz`. The
 * Western Cape is UTC+2 year-round (no DST), so a UTC month window will
 * occasionally cut a local-time day at 02:00 SAST — that is a deliberate
 * simplification while every event in the database is timestamped in UTC.
 */

export interface MonthRange {
    /** Inclusive lower bound (ISO string). */
    startIso: string;
    /** Exclusive upper bound (ISO string) — start of the next month. */
    endIso: string;
}

/**
 * Returns the [start-of-month, start-of-next-month) UTC range that contains `now`.
 */
export function computeMonthRange(now: Date): MonthRange {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}
