import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
const originalFetch = global.fetch;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    supabase = mockSupabaseClient({
        tables: { directions_cache: { data: null, error: null } },
    });
    global.fetch = vi.fn(async () =>
        new Response(
            JSON.stringify({
                status: 'OK',
                routes: [{ legs: [{ distance: { text: '5 km', value: 5000 }, duration: { text: '15 mins', value: 900 } }] }],
            }),
            { status: 200 },
        ),
    ) as typeof global.fetch;
});

afterAll(() => {
    global.fetch = originalFetch;
});

describe('GET /api/directions', () => {
    it('returns 500 when API key missing', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/directions?origin=a&destination=b' }));
        expect(res.status).toBe(500);
    });

    it('returns 400 when origin/destination missing', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/directions' }));
        expect(res.status).toBe(400);
    });

    it('returns distance/duration on success', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/directions?origin=-33.9,18.4&destination=-33.95,18.45' }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.distance_meters).toBe(5000);
        expect(body.duration_seconds).toBe(900);
    });

    it('returns 400 when Google reports an error status', async () => {
        global.fetch = vi.fn(async () =>
            new Response(JSON.stringify({ status: 'NOT_FOUND', error_message: 'bad route' }), { status: 200 }),
        ) as typeof global.fetch;
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/directions?origin=a&destination=b' }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/directions?origin=a&destination=b' }));
        expect(res.status).toBe(429);
    });
});
