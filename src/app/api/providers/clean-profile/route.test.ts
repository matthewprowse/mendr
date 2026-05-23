import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/providers/provider-profile-clean', () => ({
    normalizeProfileTextForStorage: (v: string | null) =>
        // Always emit a different value than the input so the route's
        // dirty-check decides to write.
        v ? `clean:${v.trim()}` : null,
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            providers: {
                data: {
                    id: 'p1',
                    summary: '  dirty  ',
                    summary_long: null,
                    about: null,
                    past_work: null,
                },
                error: null,
            },
        },
    });
});

describe('POST /api/providers/clean-profile', () => {
    it('returns 400 when both ids missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns 404 when provider not found', async () => {
        supabase = mockSupabaseClient({
            tables: { providers: { data: null, error: null } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { providerId: 'missing' } }),
        );
        expect(res.status).toBe(404);
    });

    it('returns updated=true when changes apply', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { providerId: 'p1' } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.updated).toBe(true);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { providers: { data: null, error: { message: 'db' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { providerId: 'p1' } }),
        );
        expect(res.status).toBe(500);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: 'p1' } }));
        expect(res.status).toBe(429);
    });
});
