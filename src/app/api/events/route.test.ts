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
        tables: { diagnosis_events: { data: null, error: null } },
    });
});

describe('POST /api/events', () => {
    it('silently returns ok on empty body', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }));
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it('silently returns ok for unknown event types', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { event_type: 'unknown', session_id: 's1' } }),
        );
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it('silently returns ok when session_id missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { event_type: 'welcome_start' } }),
        );
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it('inserts a valid event and returns ok', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: {
                    event_type: 'welcome_start',
                    session_id: 'sess-1',
                    provider_id: 'p1',
                    diagnosis_id: 'd1',
                },
            }),
        );
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(supabase.from).toHaveBeenCalledWith('diagnosis_events');
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { event_type: 'welcome_start', session_id: 's' } }));
        expect(res.status).toBe(429);
    });
});
