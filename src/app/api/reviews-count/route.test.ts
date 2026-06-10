import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            reviews: { data: [], error: null, count: 7 },
        },
    });
});

describe('POST /api/reviews-count', () => {
    it('returns 400 when providerId is missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns counts on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: 'abc' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('mendrReviewCount');
        expect(body).toHaveProperty('googleReviewCount');
    });

    it('returns zeros when Supabase is unconfigured', async () => {
        const supabaseServer = await import('@/lib/auth/supabase-server');
        vi.mocked(supabaseServer.createSupabaseServerClient).mockRejectedValueOnce(
            new Error('not configured'),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: 'abc' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.mendrReviewCount).toBe(0);
        expect(body.googleReviewCount).toBe(0);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rateLimitConfig = await import('@/lib/rate-limit-config');
        vi.mocked(rateLimitConfig.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: 'abc' } }));
        expect(res.status).toBe(429);
    });
});
