import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPlaceReviewsFromGoogle, mapGoogleReviewsToInput } from '../google-place-reviews';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('fetchPlaceReviewsFromGoogle', () => {
    it('returns an empty array when no api key is provided', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        expect(await fetchPlaceReviewsFromGoogle('places/ChIJ', undefined)).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns an empty array when the place name is blank', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        expect(await fetchPlaceReviewsFromGoogle('   ', 'key')).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fetches reviews and returns the reviews array on success', async () => {
        const reviews = [{ rating: 5, text: { text: 'Great' } }];
        vi.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ reviews }), { status: 200 })
        );
        expect(await fetchPlaceReviewsFromGoogle('places/ChIJ', 'key')).toEqual(reviews);
    });

    it('prefixes a bare place id with places/ in the request URL', async () => {
        const fetchSpy = vi
            .spyOn(global, 'fetch')
            .mockResolvedValue(new Response(JSON.stringify({ reviews: [] }), { status: 200 }));
        await fetchPlaceReviewsFromGoogle('ChIJ', 'key');
        expect(fetchSpy.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places/ChIJ');
    });

    it('returns an empty array on a non-200 response', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
        expect(await fetchPlaceReviewsFromGoogle('places/ChIJ', 'key')).toEqual([]);
    });

    it('returns an empty array when the response has no reviews field', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ id: 'x' }), { status: 200 })
        );
        expect(await fetchPlaceReviewsFromGoogle('places/ChIJ', 'key')).toEqual([]);
    });

    it('returns an empty array when fetch rejects', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));
        expect(await fetchPlaceReviewsFromGoogle('places/ChIJ', 'key')).toEqual([]);
    });
});

describe('mapGoogleReviewsToInput', () => {
    it('returns an empty array for null input', () => {
        expect(mapGoogleReviewsToInput(null as unknown as [])).toEqual([]);
    });

    it('prefers originalText.text', () => {
        expect(
            mapGoogleReviewsToInput([{ rating: 5, originalText: { text: 'Original body' } }])
        ).toEqual([{ rating: 5, text: { text: 'Original body' } }]);
    });

    it('falls back to text.text', () => {
        expect(mapGoogleReviewsToInput([{ rating: 4, text: { text: 'Body' } }])).toEqual([
            { rating: 4, text: { text: 'Body' } },
        ]);
    });

    it('falls back to a plain string text field', () => {
        expect(mapGoogleReviewsToInput([{ rating: 3, text: 'Plain body' }])).toEqual([
            { rating: 3, text: { text: 'Plain body' } },
        ]);
    });

    it('drops reviews with empty body', () => {
        expect(mapGoogleReviewsToInput([{ rating: 5, text: '   ' }])).toEqual([]);
    });

    it('sets rating to null when not numeric', () => {
        expect(mapGoogleReviewsToInput([{ rating: 'five', text: 'Body' }])).toEqual([
            { rating: null, text: { text: 'Body' } },
        ]);
    });
});
