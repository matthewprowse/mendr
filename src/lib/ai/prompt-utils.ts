/**
 * Shared prompt post-processing utilities.
 *
 * These are used both by the route-level post-processing pipeline (route.ts)
 * and the prose agent normaliser (agent-prose.ts). Keeping them here prevents
 * the two copies drifting out of sync.
 */

const MINOR_WORDS = new Set([
    'and', 'or', 'of', 'the', 'in', 'on', 'at', 'to', 'for', 'etc.',
]);

/**
 * Convert a string to Headline-Style Title Case.
 * Major words are capitalised; minor connector words (and, or, of, the, …)
 * are lowercased unless they are the first or last word.
 */
export function toHeadlineStyle(input: string): string {
    const words = input.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    return words
        .map((w, i) => {
            const lower = w.toLowerCase();
            if (i > 0 && i < words.length - 1 && MINOR_WORDS.has(lower)) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}

const FILLER_SENTENCE_START = /^[("'`\s-]*(a|an|the|this|it|there)\b[\s,:-]*/i;

/**
 * Strip filler openers (A / An / The / This / It / There) from the start of
 * every sentence in the input string and re-capitalise the remainder.
 */
export function stripFillerSentenceStarts(input: string): string {
    const sentences = input
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const fixed = sentences.map((s) => {
        const next = s.replace(FILLER_SENTENCE_START, '').trim();
        if (!next) return s;
        return next.charAt(0).toUpperCase() + next.slice(1);
    });

    return fixed.join(' ').trim();
}
