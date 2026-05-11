/** Coerce PostgREST numeric / JSON number strings into whole ZAR amounts. */
export function coerceWholeRand(v: unknown): number | null {
    if (v == null) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
    if (typeof v === 'string' && v.trim()) {
        const n = Number(v.trim());
        if (Number.isFinite(n)) return Math.round(n);
    }
    return null;
}
