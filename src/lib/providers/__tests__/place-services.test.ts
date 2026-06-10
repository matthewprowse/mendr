import { describe, it, expect } from 'vitest';
import { getPlaceServices } from '../place-services';

describe('getPlaceServices', () => {
    it('returns an empty array for undefined input', () => {
        expect(getPlaceServices(undefined)).toEqual([]);
    });

    it('returns an empty array for an empty list', () => {
        expect(getPlaceServices([])).toEqual([]);
    });

    it('maps known place types to friendly labels', () => {
        expect(getPlaceServices(['plumber'])).toEqual([{ short: 'Plumber', full: 'Plumber' }]);
    });

    it('filters out generic place types', () => {
        expect(getPlaceServices(['establishment', 'point_of_interest', 'electrician'])).toEqual([
            { short: 'Electrician', full: 'Electrician' },
        ]);
    });

    it('title-cases unknown types by replacing underscores', () => {
        expect(getPlaceServices(['gutter_cleaner'])).toEqual([
            { short: 'Gutter Cleaner', full: 'Gutter Cleaner' },
        ]);
    });

    it('normalises type keys to lowercase with underscores', () => {
        expect(getPlaceServices(['Plumbing Contractor'])).toEqual([
            { short: 'Plumbing', full: 'Plumbing' },
        ]);
    });

    it('deduplicates labels that resolve to the same value', () => {
        expect(getPlaceServices(['roofing', 'roofing_contractor'])).toEqual([
            { short: 'Roofing', full: 'Roofing' },
        ]);
    });

    it('drops falsy entries', () => {
        expect(getPlaceServices(['', 'locksmith'])).toEqual([
            { short: 'Locksmith', full: 'Locksmith' },
        ]);
    });
});
