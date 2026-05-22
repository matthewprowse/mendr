/**
 * Match-card fast summary: thresholds and parsing for the tiny Gemini JSON response
 * (`enrichProviderReviewSummaryFast`). Kept separate from `provider-enrichment.ts` for unit tests.
 */

import { sanitizeCustomerSummary } from '@/lib/providers/review-summary';

/** Minimum approved reviews (DB rows) before we call the model. */
export const FAST_SUMMARY_MIN_REVIEWS = 1;

/** Minimum characters in the concatenated review corpus (after light filtering). */
export const FAST_SUMMARY_MIN_CORPUS_CHARS = 50;

/** End index of the `{` … `}` object starting at `start`, or null (respects JSON strings). */
function findBalancedObjectEnd(s: string, start: number): number | null {
    if (s[start] !== '{') return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (c === '\\') {
                escape = true;
                continue;
            }
            if (c === '"') inString = false;
            continue;
        }
        if (c === '"') {
            inString = true;
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return null;
}

/**
 * Extract `review_summary` from model output (markdown fences, balanced `{...}` JSON).
 * Returns sanitized text or null if parsing fails.
 */
export function parseFastReviewSummaryModelJson(raw: string): string | null {
    const stripped = String(raw ?? '')
        .trim()
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/, '')
        .trim();

    const tryFromParsed = (obj: unknown): string | null => {
        const parsed = obj as { review_summary?: unknown };
        const s = typeof parsed.review_summary === 'string' ? parsed.review_summary.trim() : '';
        if (!s) return null;
        const out = sanitizeCustomerSummary(s);
        return out.length > 0 ? out : null;
    };

    const start = stripped.indexOf('{');
    if (start >= 0) {
        const end = findBalancedObjectEnd(stripped, start);
        if (end != null && end > start) {
            try {
                const parsed = JSON.parse(stripped.slice(start, end + 1));
                const fromObj = tryFromParsed(parsed);
                if (fromObj) return fromObj;
            } catch {
                /* fall through */
            }
        }
        // Truncated / odd braces: try greedy slice between first { and last }
        const lastBrace = stripped.lastIndexOf('}');
        if (lastBrace > start) {
            try {
                const parsed = JSON.parse(stripped.slice(start, lastBrace + 1));
                const fromObj = tryFromParsed(parsed);
                if (fromObj) return fromObj;
            } catch {
                /* fall through */
            }
        }
    }

    // Gemini sometimes returns a single JSON line without parseable braces, or smart quotes.
    const keyMatch = stripped.match(
        /["']review_summary["']\s*:\s*["']([^"']*)["']/i
    );
    if (keyMatch?.[1]) {
        const s = sanitizeCustomerSummary(keyMatch[1].trim());
        return s.length > 0 ? s : null;
    }

    return null;
}
