import { describe, it, expect } from 'vitest';
import { toGooglePlaceId, expandPlaceIdsForDbQuery } from '../persistence';

describe('toGooglePlaceId', () => {
    it('prefixes a raw id with places/', () => {
        expect(toGooglePlaceId('ChIJ123')).toBe('places/ChIJ123');
    });

    it('leaves an already-prefixed id unchanged', () => {
        expect(toGooglePlaceId('places/ChIJ123')).toBe('places/ChIJ123');
    });
});

describe('expandPlaceIdsForDbQuery', () => {
    it('returns both canonical and raw forms for each id', () => {
        expect(expandPlaceIdsForDbQuery(['ChIJ123'])).toEqual(['places/ChIJ123', 'ChIJ123']);
    });

    it('expands an already-prefixed id to both forms', () => {
        expect(expandPlaceIdsForDbQuery(['places/ChIJ123'])).toEqual([
            'places/ChIJ123',
            'ChIJ123',
        ]);
    });

    it('deduplicates overlapping inputs', () => {
        expect(expandPlaceIdsForDbQuery(['ChIJ123', 'places/ChIJ123'])).toEqual([
            'places/ChIJ123',
            'ChIJ123',
        ]);
    });

    it('skips non-string entries', () => {
        expect(expandPlaceIdsForDbQuery([42 as unknown as string, 'ChIJ123'])).toEqual([
            'places/ChIJ123',
            'ChIJ123',
        ]);
    });

    it('skips blank/whitespace entries', () => {
        expect(expandPlaceIdsForDbQuery(['', '   ', 'ChIJ123'])).toEqual([
            'places/ChIJ123',
            'ChIJ123',
        ]);
    });

    it('trims whitespace before expanding', () => {
        expect(expandPlaceIdsForDbQuery(['  ChIJ123  '])).toEqual(['places/ChIJ123', 'ChIJ123']);
    });

    it('returns an empty array for an empty input', () => {
        expect(expandPlaceIdsForDbQuery([])).toEqual([]);
    });
});
