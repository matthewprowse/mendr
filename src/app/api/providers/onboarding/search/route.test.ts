import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/providers/constants', () => ({ RETAIL_TYPES: new Set(['cafe']) }));
vi.mock('@/lib/providers/place-id', () => ({
    normalizePlaceId: (id: string) => id.replace(/^places\//, ''),
}));

const originalFetch = global.fetch;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    global.fetch = vi.fn(async () =>
        new Response(
            JSON.stringify({
                places: [
                    {
                        id: 'places/p1',
                        displayName: { text: 'Acme' },
                        formattedAddress: 'Cape Town',
                        types: ['plumber'],
                        rating: 4.5,
                        userRatingCount: 10,
                    },
                    {
                        id: 'places/p2',
                        displayName: { text: 'Café Skip' },
                        formattedAddress: 'CT',
                        types: ['cafe'],
                    },
                ],
            }),
            { status: 200 },
        ),
    ) as typeof global.fetch;
});

afterAll(() => {
    global.fetch = originalFetch;
});

describe('POST /api/providers/onboarding/search', () => {
    it('returns 400 on invalid JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when query too short', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { query: 'a' } }));
        expect(res.status).toBe(400);
    });

    it('returns 500 when API key missing', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { query: 'plumb' } }));
        expect(res.status).toBe(500);
    });

    it('returns filtered results (retail types removed)', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { query: 'plumber' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0].name).toBe('Acme');
    });

    it('returns 502 when Google returns an error', async () => {
        global.fetch = vi.fn(async () => new Response('err', { status: 500 })) as typeof global.fetch;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { query: 'plumber' } }));
        expect(res.status).toBe(502);
    });
});
