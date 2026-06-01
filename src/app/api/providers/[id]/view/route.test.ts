/**
 * Contract tests for POST /api/providers/[id]/view (durable profile-view capture).
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
const VALID_DIAG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({ tables: { provider_profile_views: { data: null, error: null } } });
});

describe('POST /api/providers/[id]/view', () => {
    it('returns 400 for an invalid provider id', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { source: 'match' } }), ctx('bad'));
        expect(res.status).toBe(400);
    });

    it('returns { ok: true } and inserts into provider_profile_views', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { sessionId: 'sess-1', diagnosisId: VALID_DIAG, source: 'match' },
            }),
            ctx(VALID),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(supabase.from).toHaveBeenCalledWith('provider_profile_views');
    });

    it('still returns 200 with an empty body', async () => {
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
        const res = await POST(makeRequest({ method: 'POST', body: { source: 'match' } }), ctx(VALID));
        expect(res.status).toBe(429);
    });
});
