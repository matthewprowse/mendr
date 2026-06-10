/**
 * Helpers for safely embedding user input into PostgREST filters (finding M7).
 *
 * Prefer structured builder methods (`.eq('col', value)`, `.ilike('col', pat)`)
 * which parameterise the value. When an OR across columns forces a string-built
 * `.or(...)` filter, run the term through `sanitizeOrIlikeTerm` first so it
 * cannot break out of its condition.
 */

/** Escape PostgREST ilike wildcards (% _ \) so user input matches literally. */
export function escapeIlikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Sanitize a term for embedding inside a string-built `.or()` ilike filter:
 * escape ilike wildcards and drop the characters that are significant to the
 * or-filter grammar (commas, parentheses, quotes) so the term cannot inject
 * additional conditions or break out of its own.
 */
export function sanitizeOrIlikeTerm(value: string): string {
    return escapeIlikePattern(value)
        .replace(/[(),"]/g, ' ')
        .trim();
}
