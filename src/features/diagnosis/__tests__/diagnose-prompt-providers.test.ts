/**
 * Phase 5 — `normalizeProvidersForPrompt` tests.
 *
 * This pure helper normalises the loose provider payloads sent by the chat UI
 * and diagnosis page into the strict `PromptProvider` shape used inside the
 * diagnose prompt. It defends against missing names, string-typed numbers,
 * snake_case vs. camelCase aliases, oversized address hints, and the max cap.
 */

import { describe, expect, it } from 'vitest';
import { normalizeProvidersForPrompt } from '@/features/diagnosis/diagnose-prompt-providers';

describe('normalizeProvidersForPrompt', () => {
    it('returns undefined for non-array input', () => {
        expect(normalizeProvidersForPrompt(null)).toBeUndefined();
        expect(normalizeProvidersForPrompt(undefined)).toBeUndefined();
        expect(normalizeProvidersForPrompt('nope' as unknown)).toBeUndefined();
    });

    it('returns undefined for an empty array', () => {
        expect(normalizeProvidersForPrompt([])).toBeUndefined();
    });

    it('maps a basic provider with name, rating, and rating count', () => {
        const out = normalizeProvidersForPrompt([
            { name: '  Ace Plumbing ', rating: 4.5, ratingCount: 12 },
        ]);
        expect(out).toEqual([{ name: 'Ace Plumbing', rating: 4.5, ratingCount: 12 }]);
    });

    it('coerces string-typed numbers and falls back to zero for junk', () => {
        const out = normalizeProvidersForPrompt([
            { name: 'X', rating: '4.2', ratingCount: 'abc' },
        ]);
        expect(out![0].rating).toBe(4.2);
        expect(out![0].ratingCount).toBe(0);
    });

    it('reads the snake_case rating_count alias', () => {
        const out = normalizeProvidersForPrompt([{ name: 'X', rating_count: 7 }]);
        expect(out![0].ratingCount).toBe(7);
    });

    it('skips entries without a usable name', () => {
        const out = normalizeProvidersForPrompt([
            { name: '   ' },
            { name: 'Real Co', rating: 3 },
            { rating: 5 },
        ]);
        expect(out).toHaveLength(1);
        expect(out![0].name).toBe('Real Co');
    });

    it('prefers specialisations but falls back to specializations', () => {
        const british = normalizeProvidersForPrompt([
            { name: 'A', specialisations: ['geysers', '  '] },
        ]);
        expect(british![0].specialisations).toEqual(['geysers']);

        const american = normalizeProvidersForPrompt([
            { name: 'B', specializations: ['drains'] },
        ]);
        expect(american![0].specialisations).toEqual(['drains']);
    });

    it('omits the specialisations key entirely when none are valid', () => {
        const out = normalizeProvidersForPrompt([{ name: 'A', specialisations: [] }]);
        expect('specialisations' in out![0]).toBe(false);
    });

    it('keeps favourite flag and reason only when truthy', () => {
        const out = normalizeProvidersForPrompt([
            { name: 'Fav', isFavourite: true, favouriteReason: '  Used before  ' },
            { name: 'NotFav', isFavourite: false, favouriteReason: '   ' },
        ]);
        expect(out![0].isFavourite).toBe(true);
        expect(out![0].favouriteReason).toBe('Used before');
        expect('isFavourite' in out![1]).toBe(false);
        expect('favouriteReason' in out![1]).toBe(false);
    });

    it('reads distanceText / distance_text and trims it', () => {
        const camel = normalizeProvidersForPrompt([{ name: 'A', distanceText: ' 3.2 km ' }]);
        expect(camel![0].distanceText).toBe('3.2 km');
        const snake = normalizeProvidersForPrompt([{ name: 'B', distance_text: '900 m' }]);
        expect(snake![0].distanceText).toBe('900 m');
    });

    it('derives an area hint from the first address segment', () => {
        const out = normalizeProvidersForPrompt([
            { name: 'A', address: 'Sea Point, Cape Town, 8005' },
        ]);
        expect(out![0].areaHint).toBe('Sea Point');
    });

    it('falls back to formatted_address for the area hint', () => {
        const out = normalizeProvidersForPrompt([
            { name: 'A', formatted_address: 'Claremont, Cape Town' },
        ]);
        expect(out![0].areaHint).toBe('Claremont');
    });

    it('drops area hints shorter than three characters', () => {
        const out = normalizeProvidersForPrompt([{ name: 'A', address: 'CT, x' }]);
        expect('areaHint' in out![0]).toBe(false);
    });

    it('truncates an oversized area hint with an ellipsis', () => {
        const longSegment = 'A'.repeat(60);
        const out = normalizeProvidersForPrompt([{ name: 'A', address: `${longSegment}, Town` }]);
        expect(out![0].areaHint!.endsWith('…')).toBe(true);
        expect(out![0].areaHint!.length).toBe(46);
    });

    it('respects the max cap on the number of providers', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}` }));
        const out = normalizeProvidersForPrompt(many, 5);
        expect(out).toHaveLength(5);
    });
});
