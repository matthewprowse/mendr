/**
 * Contract tests for POST /api/diagnoses/[id]/matches-shown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const VALID = '11111111-2222-3333-4444-555555555555';

function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({ tables: { diagnosis_funnel: { data: null, error: null } } });
});

describe('POST /api/diagnoses/[id]/matches-shown', () => {
    it('returns 400 for an invalid diagnosis id', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { matchCount: 3 } }), ctx('bad'));
        expect(res.status).toBe(400);
    });

    it('returns { ok: true } and stamps the funnel for a valid id', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { matchCount: 3 } }), ctx(VALID));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(supabase.from).toHaveBeenCalledWith('diagnosis_funnel');
    });

    it('still returns 200 when matchCount is missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }), ctx(VALID));
        expect(res.status).toBe(200);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { matchCount: 3 } }), ctx(VALID));
        expect(res.status).toBe(429);
    });
});
