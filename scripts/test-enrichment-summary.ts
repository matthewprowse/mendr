/**
 * Unit checks for fast match-card review summaries (no DB / Gemini).
 * Run: npm run test:enrichment-summary
 */

import assert from 'node:assert/strict';
import {
    FAST_SUMMARY_MIN_CORPUS_CHARS,
    FAST_SUMMARY_MIN_REVIEWS,
    parseFastReviewSummaryModelJson,
} from '../src/lib/fast-review-summary';

function main() {
    assert.equal(FAST_SUMMARY_MIN_REVIEWS, 1);
    assert.ok(FAST_SUMMARY_MIN_CORPUS_CHARS > 0);

    assert.equal(
        parseFastReviewSummaryModelJson('{"review_summary":"Punctual and tidy work. Clear quotes."}'),
        'Punctual and tidy work. Clear quotes.'
    );

    assert.equal(
        parseFastReviewSummaryModelJson(
            '```json\n{"review_summary":"Good service across the board."}\n```'
        ),
        'Good service across the board.'
    );

    // Balanced braces inside the string value must not break extraction.
    assert.equal(
        parseFastReviewSummaryModelJson(
            'Prefix text {"review_summary":"They fixed the {old} pipes quickly."} trailing'
        ),
        'They fixed the {old} pipes quickly.'
    );

    assert.equal(parseFastReviewSummaryModelJson('not json'), null);
    assert.equal(parseFastReviewSummaryModelJson('{"other":1}'), null);

    // Audience nouns sanitized (same rules as card copy)
    const sanitized = parseFastReviewSummaryModelJson(
        '{"review_summary":"Homeowners praise the team."}'
    );
    assert.equal(sanitized, 'people praise the team.');

    console.log('Enrichment fast-summary checks passed.');
}

void main();
