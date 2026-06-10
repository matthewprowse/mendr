import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            diagnosis_events: { data: [{ session_id: 's1' }, { session_id: 's2' }], error: null, count: 12 },
            providers: { data: [], error: null, count: 8 },
            services: { data: [{ label: 'Plumbing' }, { label: 'Electrical' }], error: null },
        },
    });
});

describe('GET /api/public/marketing-stats', () => {
    it('returns aggregated totals and services', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/public/marketing-stats' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.totals).toBeDefined();
        expect(typeof body.totals.diagnoses_completed).toBe('number');
        expect(Array.isArray(body.services)).toBe(true);
    });

    it('emits a public cache-control header', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/public/marketing-stats' }));
        expect(res.headers.get('cache-control')).toMatch(/public/);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/public/marketing-stats' }));
        expect(res.status).toBe(429);
    });
});
