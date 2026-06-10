import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();

vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => ({ models: { generateContent } }),
    GEMINI_MODEL_NAME: 'gemini-test',
}));

import { sanitizeCustomerSummary, summarizeReviews } from '../review-summary';

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('sanitizeCustomerSummary', () => {
    it('returns an empty string for empty input', () => {
        expect(sanitizeCustomerSummary('')).toBe('');
    });

    it('replaces em dashes with a space', () => {
        expect(sanitizeCustomerSummary('Fast—reliable')).toBe('Fast reliable');
    });

    it('rewrites audience nouns to "people"', () => {
        expect(sanitizeCustomerSummary('Customers love it')).toBe('people love it');
        expect(sanitizeCustomerSummary('Homeowners trust them')).toBe('people trust them');
        expect(sanitizeCustomerSummary('Clients and residents agree')).toBe(
            'people and people agree'
        );
    });

    it('collapses repeated whitespace', () => {
        expect(sanitizeCustomerSummary('a    b')).toBe('a b');
    });
});

describe('summarizeReviews', () => {
    const baseParams = {
        providerName: 'Acme Plumbing',
        rating: 4.5,
        ratingCount: 10,
    };

    it('returns null when given no reviews', async () => {
        expect(await summarizeReviews({ ...baseParams, reviews: [] })).toBeNull();
    });

    it('returns null when reviews is not an array', async () => {
        expect(
            await summarizeReviews({
                ...baseParams,
                reviews: null as unknown as [],
            })
        ).toBeNull();
    });

    it('returns null when all reviews have empty text', async () => {
        expect(
            await summarizeReviews({
                ...baseParams,
                reviews: [{ rating: 5, text: '' }, { rating: 4, text: null }],
            })
        ).toBeNull();
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns a sanitised summary and rating bucket meta on success', async () => {
        generateContent.mockResolvedValue({
            text: JSON.stringify({ summary: 'Punctual and tidy. Clear quotes upfront.' }),
        });

        const result = await summarizeReviews({
            ...baseParams,
            reviews: [
                { rating: 5, text: 'Excellent and on time' },
                { rating: 1, text: 'Late and rude' },
                { rating: 3, text: 'It was okay overall' },
            ],
        });

        expect(result).not.toBeNull();
        expect(result!.summary).toBe('Punctual and tidy. Clear quotes upfront.');
        expect(result!.meta).toEqual({ kind: 'reviews', pos: 1, neg: 1, neu: 1 });
        expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('truncates a long summary at the last sentence boundary', async () => {
        const long =
            'This is the first sentence that fits. This is a second sentence that pushes well beyond the one hundred and thirty character ceiling for sure.';
        generateContent.mockResolvedValue({ text: JSON.stringify({ summary: long }) });

        const result = await summarizeReviews({
            ...baseParams,
            reviews: [{ rating: 5, text: 'Good work indeed' }],
        });

        expect(result).not.toBeNull();
        expect(result!.summary.length).toBeLessThanOrEqual(130);
        expect(result!.summary.endsWith('.')).toBe(true);
    });

    it('returns null when the model call throws', async () => {
        generateContent.mockRejectedValue(new Error('model down'));
        const result = await summarizeReviews({
            ...baseParams,
            reviews: [{ rating: 5, text: 'Reliable plumber' }],
        });
        expect(result).toBeNull();
    });

    it('counts reviews without a numeric rating as neutral', async () => {
        generateContent.mockResolvedValue({ text: JSON.stringify({ summary: 'Solid work here.' }) });
        const result = await summarizeReviews({
            ...baseParams,
            reviews: [{ rating: null, text: 'No rating but helpful' }],
        });
        expect(result!.meta).toEqual({ kind: 'reviews', pos: 0, neg: 0, neu: 1 });
    });
});
