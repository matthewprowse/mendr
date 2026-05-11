/**
 * Server-side gate for LLM-produced provider copy.
 *
 * Detects when Gemini (or any other model) leaks raw HTML/CSS, code fences,
 * markdown structure, or otherwise low-signal content into fields we plan to
 * persist (about_business, past_work, customer_review_summary, bio).
 *
 * Read-side defence: also used by `/api/providers/[id]` to mask out legacy
 * rows that already contain contaminated text and to fire a re-enrichment.
 */

import { isLowSignalProfileText } from '@/lib/provider-profile-clean';

export type GuardReason = 'css' | 'html' | 'structural' | 'low_signal';

export type GuardVerdict =
    | { ok: true }
    | { ok: false; reason: GuardReason; sample: string };

const CSS_LEAK_TOKENS: RegExp[] = [
    /@media\b/i,
    /\bfont-(family|size|weight|style|variant)\s*:/i,
    /\b(margin|padding|border|color|background|display|position|width|height|top|left|right|bottom|z-index|opacity|line-height|letter-spacing|text-(align|decoration|transform))\s*:/i,
    /\b\d+(\.\d+)?\s*(px|rem|em|vh|vw|ch|pt)\b/i,
    /(?:^|\s)[#.][a-zA-Z][\w-]*\s*\{/,
    /\b(?:rgb|rgba|hsl|hsla)\s*\(/i,
    /\bdata:image\/[a-z+]+;base64,/i,
    /!important\b/i,
];

const HTML_LEAK_TOKENS: RegExp[] = [
    /<\/?[a-z][\w-]*\b[^>]*>/i,
    /&(?:amp|lt|gt|quot|apos|nbsp|#\d{1,5});/i,
    /\b(?:href|src|alt|class|aria-[a-z]+|data-[a-z-]+)\s*=\s*["']/i,
];

const STRUCTURAL_LEAK_TOKENS: RegExp[] = [
    /^```/m,
    /^\s*---\s*$/m,
    /\\u[0-9a-f]{4}/i,
    /\\n\\n|\\t/,
    /^\s*\{[\s\S]*"[\w_]+"\s*:/m,
    /^\s*[A-Z][A-Z0-9 _-]{14,}\s*$/m,
];

function pickSample(text: string, match: RegExpMatchArray | null): string {
    if (!match || match.index == null) return text.slice(0, 120);
    const start = Math.max(0, match.index - 24);
    const end = Math.min(text.length, match.index + match[0].length + 24);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) return m;
    }
    return null;
}

/**
 * Validate a single string field for HTML/CSS/structural leakage and
 * obvious low-signal scrape residue.
 *
 * Empty / whitespace-only inputs return `ok: true` so callers can decide
 * what an absent field means; the persistence layer can still reject empty
 * strings if it cares.
 */
export function validateLlmContentSafe(input: string | null | undefined): GuardVerdict {
    const text = (input ?? '').trim();
    if (!text) return { ok: true };

    const cssMatch = firstMatch(text, CSS_LEAK_TOKENS);
    if (cssMatch) return { ok: false, reason: 'css', sample: pickSample(text, cssMatch) };

    const htmlMatch = firstMatch(text, HTML_LEAK_TOKENS);
    if (htmlMatch) return { ok: false, reason: 'html', sample: pickSample(text, htmlMatch) };

    const structuralMatch = firstMatch(text, STRUCTURAL_LEAK_TOKENS);
    if (structuralMatch) {
        return {
            ok: false,
            reason: 'structural',
            sample: pickSample(text, structuralMatch),
        };
    }

    if (isLowSignalProfileText(text)) {
        return { ok: false, reason: 'low_signal', sample: text.slice(0, 120) };
    }

    return { ok: true };
}

/**
 * Best-effort masker for legacy rows: strips matching ranges instead of
 * rejecting the whole field. Useful when we'd rather show a partial blurb
 * than nothing at all while a re-enrichment is in flight.
 */
export function maskUnsafeContent(input: string | null | undefined): string {
    const text = (input ?? '').trim();
    if (!text) return '';
    let out = text;
    for (const pattern of [...CSS_LEAK_TOKENS, ...HTML_LEAK_TOKENS, ...STRUCTURAL_LEAK_TOKENS]) {
        out = out.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'), ' ');
    }
    return out
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim();
}

/**
 * Convenience: validate a record of fields and return the failures keyed by
 * field name. Order is preserved.
 */
export function validateLlmContentRecord<T extends Record<string, string | null | undefined>>(
    fields: T
): Partial<Record<keyof T, Extract<GuardVerdict, { ok: false }>>> {
    const failures: Partial<Record<keyof T, Extract<GuardVerdict, { ok: false }>>> = {};
    for (const key of Object.keys(fields) as (keyof T)[]) {
        const verdict = validateLlmContentSafe(fields[key] ?? null);
        if (!verdict.ok) failures[key] = verdict;
    }
    return failures;
}
