/**
 * Ported from scripts/test-enrichment-summary.ts — fast match-card review
 * summary JSON parsing.
 */
import { describe, it, expect } from 'vitest';
import {
    FAST_SUMMARY_MIN_CORPUS_CHARS,
    FAST_SUMMARY_MIN_REVIEWS,
    parseFastReviewSummaryModelJson,
} from '../fast-review-summary';

describe('fast review summary thresholds', () => {
    it('requires at least one review', () => {
        expect(FAST_SUMMARY_MIN_REVIEWS).toBe(1);
    });

    it('has a positive minimum corpus character count', () => {
        expect(FAST_SUMMARY_MIN_CORPUS_CHARS).toBeGreaterThan(0);
    });
});

describe('parseFastReviewSummaryModelJson', () => {
    it('extracts the review_summary from a plain JSON object', () => {
        expect(
            parseFastReviewSummaryModelJson(
                '{"review_summary":"Punctual and tidy work. Clear quotes."}'
            )
        ).toBe('Punctual and tidy work. Clear quotes.');
    });

    it('extracts the review_summary from a fenced code block', () => {
        expect(
            parseFastReviewSummaryModelJson(
                '```json\n{"review_summary":"Good service across the board."}\n```'
            )
        ).toBe('Good service across the board.');
    });

    it('handles balanced braces inside the value', () => {
        expect(
            parseFastReviewSummaryModelJson(
                'Prefix text {"review_summary":"They fixed the {old} pipes quickly."} trailing'
            )
        ).toBe('They fixed the {old} pipes quickly.');
    });

    it('returns null for non-JSON input', () => {
        expect(parseFastReviewSummaryModelJson('not json')).toBeNull();
    });

    it('returns null when review_summary is absent', () => {
        expect(parseFastReviewSummaryModelJson('{"other":1}')).toBeNull();
    });

    it('sanitises audience nouns in the extracted summary', () => {
        expect(
            parseFastReviewSummaryModelJson(
                '{"review_summary":"Homeowners praise the team."}'
            )
        ).toBe('people praise the team.');
    });
});
