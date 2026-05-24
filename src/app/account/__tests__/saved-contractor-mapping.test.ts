import { describe, it, expect } from 'vitest';
import { mapSavedRow, type RawSavedProviderJoin } from '../lib/map-saved-row';

const fullProvider = {
    id: 'prov-1',
    name: 'Acme Plumbing (Pty) Ltd',
    phone: '+27123456789',
    website: 'https://acme.example.com',
    address: '12 Long Street, Cape Town, Western Cape',
    rating: 4.6,
    rating_count: 47,
    specialisations: ['Plumbing', 'Geyser'],
    is_active: true,
};

describe('mapSavedRow', () => {
    it('handles providers as a single object (returns 1 row)', () => {
        const row: RawSavedProviderJoin = {
            id: 'saved-1',
            provider_id: 'prov-1',
            providers: fullProvider,
        };
        const out = mapSavedRow(row);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({
            savedId: 'saved-1',
            providerId: 'prov-1',
            name: 'Acme Plumbing (Pty) Ltd',
            phone: '+27123456789',
            email: null,
            website: 'https://acme.example.com',
            rating: 4.6,
            ratingCount: 47,
            address: '12 Long Street, Cape Town, Western Cape',
            services: ['Plumbing', 'Geyser'],
        });
    });

    it('handles providers as an array (returns first element)', () => {
        const row: RawSavedProviderJoin = {
            id: 'saved-2',
            provider_id: 'prov-1',
            providers: [fullProvider],
        };
        const out = mapSavedRow(row);
        expect(out).toHaveLength(1);
        expect(out[0]?.providerId).toBe('prov-1');
        expect(out[0]?.savedId).toBe('saved-2');
        expect(out[0]?.name).toBe('Acme Plumbing (Pty) Ltd');
    });

    it('filters out inactive providers (is_active: false)', () => {
        const row: RawSavedProviderJoin = {
            id: 'saved-3',
            provider_id: 'prov-1',
            providers: { ...fullProvider, is_active: false },
        };
        expect(mapSavedRow(row)).toEqual([]);
    });

    it('filters out rows with no joined provider', () => {
        const row: RawSavedProviderJoin = {
            id: 'saved-4',
            provider_id: 'prov-missing',
            providers: null,
        };
        expect(mapSavedRow(row)).toEqual([]);
    });

    it('coerces null/missing fields to safe defaults', () => {
        const row: RawSavedProviderJoin = {
            id: 'saved-5',
            provider_id: 'prov-2',
            providers: {
                id: 'prov-2',
                name: null,
                phone: null,
                website: null,
                address: null,
                rating: null,
                rating_count: null,
                specialisations: null,
                is_active: true,
            },
        };
        const out = mapSavedRow(row);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({
            savedId: 'saved-5',
            providerId: 'prov-2',
            name: '',
            phone: null,
            email: null,
            website: null,
            rating: null,
            ratingCount: 0,
            address: '',
            services: [],
        });
    });

    it('filters out rows where the provider array is empty', () => {
        const row: RawSavedProviderJoin = {
            id: 'saved-6',
            provider_id: 'prov-1',
            providers: [],
        };
        expect(mapSavedRow(row)).toEqual([]);
    });
});
