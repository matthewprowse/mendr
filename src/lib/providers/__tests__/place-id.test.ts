import { describe, it, expect } from 'vitest';
import { normalizePlaceId } from '../place-id';

describe('normalizePlaceId', () => {
    it('strips the places/ prefix', () => {
        expect(normalizePlaceId('places/ChIJ123')).toBe('ChIJ123');
    });

    it('leaves a raw id unchanged', () => {
        expect(normalizePlaceId('ChIJ123')).toBe('ChIJ123');
    });

    it('returns an empty string for an empty input', () => {
        expect(normalizePlaceId('')).toBe('');
    });

    it('handles a null-ish input via the falsy guard', () => {
        expect(normalizePlaceId(undefined as unknown as string)).toBe('');
        expect(normalizePlaceId(null as unknown as string)).toBe('');
    });

    it('only strips a leading prefix, not a mid-string occurrence', () => {
        expect(normalizePlaceId('xplaces/ChIJ')).toBe('xplaces/ChIJ');
    });
});
