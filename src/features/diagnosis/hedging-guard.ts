/**
 * Detects hedging-dominated diagnosis text — the model verbally signalling that
 * it's guessing even when it reports high self-confidence. LLMs are poor at
 * calibrating their own `confidence` field; the language they generate is often
 * a better signal of uncertainty. When the diagnosis text leans heavily on
 * phrases like "appears to be", "looks like it might", "without more
 * information", we should override `requires_clarification` to true.
 *
 * Background: 2026-05-23 garage-spring failure case. The classifier returned
 * `confidence: 88` while the prose hedged across every sentence — the user
 * never saw clarification questions. Self-reported confidence was lying;
 * lexical signal would have caught it.
 *
 * This module is intentionally heuristic. False positives are cheap (the user
 * sees clarification questions instead of a diagnosis) — false negatives are
 * expensive (the user gets matched to the wrong contractor).
 */

/** Phrases that signal the model is unsure. Case-insensitive. */
const HEDGING_PATTERNS: RegExp[] = [
    /\bappears? to be\b/i,
    /\bappears? (?:to|that)\b/i,
    /\blooks? like (?:it (?:might|could|may)|a possible)\b/i,
    /\bcould (?:possibly|potentially)\b/i,
    /\bmight (?:be|indicate|suggest)\b/i,
    /\bmay (?:be|indicate|suggest)\b/i,
    /\bpossibly\b/i,
    /\bpotentially\b/i,
    /\bperhaps\b/i,
    /\bseems (?:to|like)\b/i,
    /\bnot (?:entirely|completely|fully) (?:clear|certain|sure)\b/i,
    /\bdifficult to (?:tell|say|determine|confirm)\b/i,
    /\bhard to (?:tell|say|determine|confirm)\b/i,
    /\bwithout (?:more|additional|further) (?:information|context|detail|photos?)\b/i,
    /\bcannot (?:tell|determine|confirm|be sure)\b/i,
    /\bunable to (?:tell|determine|confirm|identify)\b/i,
    /\bunclear\b/i,
    /\bambiguous\b/i,
    /\bnot (?:obvious|visible) from\b/i,
    /\bI (?:cannot|can'?t|am unable)\b/i,
];

/**
 * Phrases that strongly signal hedging — count for double weight. Hitting one
 * of these in a short diagnosis is enough to flip the guard on its own.
 */
const STRONG_HEDGING_PATTERNS: RegExp[] = [
    /\bcannot (?:tell|determine|confirm|be sure)\b/i,
    /\bunable to (?:tell|determine|confirm|identify)\b/i,
    /\bdifficult to (?:tell|say|determine|confirm)\b/i,
    /\bhard to (?:tell|say|determine|confirm)\b/i,
    /\bwithout (?:more|additional|further) (?:information|context|detail|photos?)\b/i,
    /\bnot (?:enough|sufficient) (?:detail|information|context)\b/i,
];

export interface HedgingVerdict {
    /** Number of distinct hedging patterns matched. */
    hits: number;
    /** Number of strong-hedging patterns matched. */
    strongHits: number;
    /** Total sentences in the analysed text. Sentences are split on `.?!`. */
    sentences: number;
    /** Ratio of hedging hits to sentences (0–1+). */
    density: number;
    /**
     * True when the text is hedging-dominated. Triggers a forced
     * `requires_clarification = true` upstream.
     */
    excessive: boolean;
    /** The first matched substring (for logging / debugging). */
    sample: string;
}

/**
 * Count distinct sentences. Treats `.`, `?`, `!` as terminators and ignores
 * empty splits. A diagnosis with zero sentences (e.g. empty string) returns 1
 * so we don't divide by zero downstream.
 */
function countSentences(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 1;
    const matches = trimmed.split(/[.?!]+/).filter((s) => s.trim().length > 2);
    return Math.max(1, matches.length);
}

/**
 * Analyse diagnosis text for hedging dominance.
 *
 * Inputs: typically a concatenation of `thought`, `diagnosis`, and `message`
 * from the prose response. The caller decides which fields to combine.
 *
 * Thresholds tuned conservatively — bias toward asking the user a question
 * over silently shipping a hedged "diagnosis":
 *
 *   - any STRONG match in a ≤3-sentence diagnosis → excessive
 *   - density (hits / sentences) ≥ 0.5 → excessive
 *   - ≥ 3 distinct hits anywhere → excessive
 */
export function detectHedging(text: string | null | undefined): HedgingVerdict {
    const t = (text ?? '').toString();
    if (!t.trim()) {
        return { hits: 0, strongHits: 0, sentences: 1, density: 0, excessive: false, sample: '' };
    }

    let hits = 0;
    let strongHits = 0;
    let firstSample = '';

    for (const re of HEDGING_PATTERNS) {
        const m = t.match(re);
        if (m) {
            hits += 1;
            if (!firstSample) firstSample = m[0];
        }
    }
    for (const re of STRONG_HEDGING_PATTERNS) {
        const m = t.match(re);
        if (m) {
            strongHits += 1;
            if (!firstSample) firstSample = m[0];
        }
    }

    const sentences = countSentences(t);
    const density = hits / sentences;

    const excessive =
        (strongHits >= 1 && sentences <= 3) ||
        density >= 0.5 ||
        hits >= 3;

    return { hits, strongHits, sentences, density, excessive, sample: firstSample };
}

/**
 * Convenience helper that composes the typical input fields and returns just
 * the excessive flag. Use in the response-builder merge step.
 */
export function isProseExcessivelyHedging(input: {
    thought?: string | null;
    diagnosis?: string | null;
    message?: string | null;
}): boolean {
    const combined = [input.thought ?? '', input.diagnosis ?? '', input.message ?? '']
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ');
    return detectHedging(combined).excessive;
}
