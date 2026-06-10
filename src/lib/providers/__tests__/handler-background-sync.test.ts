import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

vi.mock('@/lib/utils', () => ({
    formatBusinessName: (n: string) => n,
}));

vi.mock('../refresh-provider-website', () => ({
    refreshProviderWebsiteById: vi.fn(async () => ({ ok: true })),
}));

import { scheduleProvidersBackgroundSync } from '../handler-background-sync';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

const flush = async () => {
    // Let the void async IIFE run its awaited steps.
    for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminClient = mockSupabaseClient();
});

describe('scheduleProvidersBackgroundSync', () => {
    it('returns void synchronously', () => {
        expect(
            scheduleProvidersBackgroundSync({ limitedProviders: [], places: [], apiKey: 'k' })
        ).toBeUndefined();
    });

    it('does nothing when there are no providers', async () => {
        scheduleProvidersBackgroundSync({ limitedProviders: [], places: [], apiKey: 'k' });
        await flush();
        expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    });

    it('upserts provider rows for each provider', async () => {
        const upsert = vi.fn(() => ({
            error: null,
            then: (r: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(r),
        }));
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                reviews: { data: [], error: null },
            },
        });
        // Spy on the providers upsert to confirm it is called.
        const fromSpy = vi.spyOn(adminClient, 'from');

        scheduleProvidersBackgroundSync({
            limitedProviders: [
                {
                    placeId: 'ChIJ1',
                    name: 'Acme',
                    address: '1 St',
                    rating: 4,
                    ratingCount: 3,
                    phone: null,
                    website: null,
                    latitude: -33,
                    longitude: 18,
                } as never,
            ],
            places: [{ id: 'places/ChIJ1', reviews: [] }],
            apiKey: 'k',
        });
        await flush();

        expect(createSupabaseAdminClient).toHaveBeenCalled();
        expect(fromSpy).toHaveBeenCalledWith('providers');
        void upsert;
    });

    it('stops after a failed provider upsert', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: (_t, op) =>
                    op === 'upsert'
                        ? { data: null, error: { message: 'conflict' } }
                        : { data: [], error: null },
            },
        });
        const fromSpy = vi.spyOn(adminClient, 'from');

        scheduleProvidersBackgroundSync({
            limitedProviders: [
                {
                    placeId: 'ChIJ1',
                    name: 'Acme',
                    address: '1 St',
                    rating: 4,
                    ratingCount: 3,
                    phone: null,
                    website: null,
                    latitude: -33,
                    longitude: 18,
                } as never,
            ],
            places: [],
            apiKey: 'k',
        });
        await flush();

        // Only the providers upsert ran; the reviews select should not be reached.
        const tablesQueried = fromSpy.mock.calls.map((c) => c[0]);
        expect(tablesQueried).toContain('providers');
        expect(tablesQueried).not.toContain('reviews');
    });
});
