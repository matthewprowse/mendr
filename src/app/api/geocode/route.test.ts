import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const originalFetch = global.fetch;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    supabase = mockSupabaseClient({
        tables: { geocode_cache: { data: null, error: null } },
    });
    global.fetch = vi.fn(async () =>
        new Response(
            JSON.stringify({
                status: 'OK',
                results: [
                    {
                        geometry: { location: { lat: -33.9, lng: 18.4 } },
                        formatted_address: 'Cape Town, South Africa',
                        address_components: [
                            { long_name: 'Western Cape', short_name: 'WC', types: ['administrative_area_level_1'] },
                        ],
                    },
                ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof global.fetch;
});

afterAll(() => {
    global.fetch = originalFetch;
});

import { afterAll } from 'vitest';

describe('POST /api/geocode', () => {
    it('returns 500 when API key is missing', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.GOOGLE_MAPS_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { address: 'x' } }));
        expect(res.status).toBe(500);
    });

    it('returns 400 when body is malformed', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: undefined, rawBody: 'not json' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when neither coords nor address are provided', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns lat/lng on happy-path address geocode', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { address: 'Cape Town', westernCapeOnly: true } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.lat).toBe(-33.9);
        expect(body.lng).toBe(18.4);
    });

    it('returns 422 with WC-specific error when results are outside Western Cape', async () => {
        global.fetch = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    status: 'OK',
                    results: [
                        {
                            geometry: { location: { lat: -26, lng: 28 } },
                            formatted_address: 'Johannesburg',
                            address_components: [
                                { long_name: 'Gauteng', short_name: 'GP', types: ['administrative_area_level_1'] },
                            ],
                        },
                    ],
                }),
                { status: 200 },
            ),
        ) as typeof global.fetch;
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { lat: -26, lng: 28, westernCapeOnly: true },
            }),
        );
        expect(res.status).toBe(422);
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { address: 'x' } }));
        expect(res.status).toBe(429);
    });
});
