import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

import { loadContractorProfileById } from '../contractor-profile-server';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
});

describe('loadContractorProfileById', () => {
    it('returns bad_request for a blank id', async () => {
        adminClient = mockSupabaseClient();
        expect(await loadContractorProfileById('   ')).toEqual({ status: 'bad_request' });
    });

    it('returns not_found when no provider row matches a UUID', async () => {
        adminClient = mockSupabaseClient({ tables: { providers: { data: null, error: null } } });
        expect(await loadContractorProfileById(VALID_UUID)).toEqual({ status: 'not_found' });
    });

    it('returns not_found when no provider row matches a place id', async () => {
        adminClient = mockSupabaseClient({ tables: { providers: { data: null, error: null } } });
        expect(await loadContractorProfileById('ChIJabc')).toEqual({ status: 'not_found' });
    });

    it('returns an error result when the provider lookup throws', async () => {
        adminClient = mockSupabaseClient({
            tables: { providers: { data: null, error: { message: 'db down' } } },
        });
        const result = await loadContractorProfileById(VALID_UUID);
        expect(result.status).toBe('error');
    });

    it('hydrates a full profile for a valid provider', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: {
                        id: VALID_UUID,
                        google_place_id: 'places/ChIJ1',
                        name: '  Acme Plumbing  ',
                        address: '  1 Main Rd  ',
                        latitude: -33.9,
                        longitude: 18.4,
                        phone: '021 555 0000',
                        website: 'https://acme.example',
                        rating: 4.6,
                        rating_count: 12,
                        summary: '',
                        summary_long: null,
                        about: null,
                        past_work: null,
                        specialisations: ['Geyser repair'],
                        highlights: ['Fast response'],
                        service_areas: ['Cape Town'],
                        weekday_descriptions: ['Monday: 08:00 - 17:00'],
                        years_in_business: 8,
                    },
                    error: null,
                },
                provider_certifications: { data: [], error: null },
                provider_images: { data: [], error: null },
                provider_cache: { data: { review_summary: null }, error: null },
            },
        });

        const result = await loadContractorProfileById(VALID_UUID);
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.profile.providerId).toBe(VALID_UUID);
        expect(result.profile.name).toBe('Acme Plumbing');
        expect(result.profile.address).toBe('1 Main Rd');
        expect(result.profile.rating).toBe(4.6);
        expect(result.profile.ratingCount).toBe(12);
        expect(result.profile.yearsInBusiness).toBe(8);
        expect(result.profile.highlights).toEqual(['Fast response']);
        expect(result.profile.serviceAreas).toEqual(['Cape Town']);
        expect(result.profile.specialisations).toEqual(['Geyser repair']);
        expect(result.profile.hasWorkPhotos).toBe(false);
    });

    it('builds gallery image urls from approved provider_images', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: {
                        id: VALID_UUID,
                        google_place_id: 'places/ChIJ1',
                        name: 'Acme',
                        address: '1 St',
                        latitude: null,
                        longitude: null,
                        phone: null,
                        website: null,
                        rating: null,
                        rating_count: null,
                        summary: null,
                        summary_long: null,
                        about: null,
                        past_work: null,
                        specialisations: null,
                        highlights: null,
                        service_areas: null,
                        weekday_descriptions: null,
                        years_in_business: null,
                    },
                    error: null,
                },
                provider_certifications: { data: [], error: null },
                provider_images: {
                    data: [{ bucket: 'gallery', path: 'a/b.jpg', caption: 'Job 1' }],
                    error: null,
                },
                provider_cache: { data: null, error: null },
            },
        });

        const result = await loadContractorProfileById(VALID_UUID);
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.profile.images).toEqual([
            {
                url: 'https://proj.supabase.co/storage/v1/object/public/gallery/a/b.jpg',
                caption: 'Job 1',
            },
        ]);
        expect(result.profile.hasWorkPhotos).toBe(true);
        expect(result.profile.rating).toBeNull();
        expect(result.profile.ratingCount).toBe(0);
    });
});
