/**
 * Contract tests for GET /api/whatsapp/simulator/profiles.
 *
 * Covers: rate limit, DB error → 500, name composition fallbacks
 * (first+surname → username → 'Unnamed user'), and location counting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let rateLimited = false;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => {
        if (rateLimited) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }
        return null;
    }),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    rateLimited = false;
    supabase = mockSupabaseClient({
        tables: { profiles: { data: [], error: null } },
    });
});

describe('GET /api/whatsapp/simulator/profiles', () => {
    it('returns 429 when rate limited', async () => {
        rateLimited = true;
        const { GET } = await import('./route');
        expect((await GET(makeRequest({}))).status).toBe(429);
    });

    it('returns 500 when the profiles query errors', async () => {
        supabase = mockSupabaseClient({
            tables: { profiles: { data: null, error: { message: 'db down' } } },
        });
        const { GET } = await import('./route');
        expect((await GET(makeRequest({}))).status).toBe(500);
    });

    it('composes display names with sensible fallbacks', async () => {
        supabase = mockSupabaseClient({
            tables: {
                profiles: {
                    data: [
                        {
                            id: 'p1',
                            first_name: 'Thandi',
                            surname: 'Ngcobo',
                            username: 'thandi',
                            locations: [{}, {}],
                        },
                        {
                            id: 'p2',
                            first_name: null,
                            surname: null,
                            username: 'just-a-handle',
                            locations: null,
                        },
                        {
                            id: 'p3',
                            first_name: null,
                            surname: null,
                            username: null,
                            locations: [],
                        },
                    ],
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({}));
        expect(res.status).toBe(200);
        const { profiles } = await res.json();
        expect(profiles).toEqual([
            { id: 'p1', name: 'Thandi Ngcobo', locationCount: 2 },
            { id: 'p2', name: 'just-a-handle', locationCount: 0 },
            { id: 'p3', name: 'Unnamed user', locationCount: 0 },
        ]);
    });
});
