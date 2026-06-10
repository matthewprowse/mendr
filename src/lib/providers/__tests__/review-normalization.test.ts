import { describe, it, expect } from 'vitest';
import { normalizeReviewForDisplay } from '../review-normalization';

// ---------------------------------------------------------------------------
// Body coercion / whitespace
// ---------------------------------------------------------------------------

describe('normalizeReviewForDisplay — body', () => {
    it('returns the trimmed body', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: '  Excellent service!  ',
            originalName: 'Jane Doe',
        });
        expect(result.body).toBe('Excellent service!');
    });

    it('collapses internal whitespace runs to a single space', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'great\n\n\nplumber   really\tprompt',
            originalName: 'Sam',
        });
        expect(result.body).toBe('great plumber really prompt');
    });

    it('returns an empty string when body is whitespace only', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: '   ',
            originalName: 'Pat Smith',
        });
        expect(result.body).toBe('');
    });
});

// ---------------------------------------------------------------------------
// Reviewer name — title-casing and pass-through
// ---------------------------------------------------------------------------

describe('normalizeReviewForDisplay — reviewer name title-casing', () => {
    it('title-cases an all-lowercase name', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'Great work',
            originalName: 'jane doe',
        });
        expect(result.reviewerName).toBe('Jane Doe');
    });

    it('title-cases an all-uppercase name', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'Great work',
            originalName: 'JANE DOE',
        });
        expect(result.reviewerName).toBe('Jane Doe');
    });

    it('preserves multi-word names', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'Great work',
            originalName: 'mary anne van der merwe',
        });
        expect(result.reviewerName).toBe('Mary Anne Van Der Merwe');
    });

    it('collapses extra whitespace within names', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'ok',
            originalName: '  john   smith  ',
        });
        expect(result.reviewerName).toBe('John Smith');
    });
});

// ---------------------------------------------------------------------------
// Fake-name fallback
// ---------------------------------------------------------------------------

describe('normalizeReviewForDisplay — fake name fallback', () => {
    const FALLBACK_NAMES = [
        'Alex Moyo',
        'Thabo Jacobs',
        'Lerato Daniels',
        'Michael Petersen',
        'Nomsa Dlamini',
        'Sam Pillay',
    ];

    it('replaces null name with a deterministic fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'Great service today',
            originalName: null,
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('replaces empty-string name with a fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'Great service',
            originalName: '',
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('replaces whitespace-only name with a fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'Great service',
            originalName: '   ',
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('replaces single-character name with a fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'Great service',
            originalName: 'J',
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('replaces numeric-only name with a fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'ok',
            originalName: '12345',
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('replaces generic "user123" placeholder with a fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'ok',
            originalName: 'user123',
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('replaces "anonymous" with a fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'ok',
            originalName: 'anonymous',
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('replaces "test" / "tester" / "anon" with a fallback', async () => {
        for (const name of ['test', 'tester', 'anon']) {
            const result = await normalizeReviewForDisplay({
                originalBody: 'ok',
                originalName: name,
            });
            expect(FALLBACK_NAMES).toContain(result.reviewerName);
        }
    });

    it('replaces a URL-embedded name with a fallback', async () => {
        const result = await normalizeReviewForDisplay({
            originalBody: 'ok',
            originalName: 'See https://spam.example',
        });
        expect(FALLBACK_NAMES).toContain(result.reviewerName);
    });

    it('returns the same fallback name for identical input (deterministic)', async () => {
        const a = await normalizeReviewForDisplay({
            originalBody: 'Same body for both reviews',
            originalName: null,
        });
        const b = await normalizeReviewForDisplay({
            originalBody: 'Same body for both reviews',
            originalName: null,
        });
        expect(a.reviewerName).toBe(b.reviewerName);
    });

    it('returns the same fallback even when the originalName changes (seed uses body)', async () => {
        const a = await normalizeReviewForDisplay({
            originalBody: 'Identical text content',
            originalName: '',
        });
        const b = await normalizeReviewForDisplay({
            originalBody: 'Identical text content',
            originalName: 'test',
        });
        // Both should map to the same fallback because the body seed wins.
        expect(a.reviewerName).toBe(b.reviewerName);
    });
});
