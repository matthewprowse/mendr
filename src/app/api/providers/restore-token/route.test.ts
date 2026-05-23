import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/ai/ai-logging', () => ({ logAiEvent: vi.fn() }));
vi.mock('@/lib/providers/ranking', () => ({ getISOWeekKey: () => '2026-W21' }));

const baseBody = {
    providerId: 'p1',
    conversationId: 'c1',
    channel: 'phone' as const,
};

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            provider_contact_events: { data: null, error: null },
            provider_rotation_tokens: { data: { tokens_remaining: 4 }, error: null },
        },
    });
});

describe('POST /api/providers/restore-token', () => {
    it('returns 400 when channel invalid', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...baseBody, channel: 'fax' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when providerId missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: 'c1', channel: 'phone' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns deduped=true when a recent matching event exists', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_contact_events: {
                    data: { id: 'e1', created_at: new Date().toISOString() },
                    error: null,
                },
                provider_rotation_tokens: { data: { tokens_remaining: 4 }, error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: baseBody }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.deduped).toBe(true);
    });

    it('inserts event and increments tokens on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: baseBody }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.deduped).toBe(false);
        expect(typeof body.tokensRemaining).toBe('number');
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: baseBody }));
        expect(res.status).toBe(429);
    });
});
