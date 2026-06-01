import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let denyAdmin = false;

vi.mock('@/lib/auth/admin-auth', () => ({
    requireAdmin: vi.fn(async () => {
        if (denyAdmin) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return null;
    }),
}));

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({ createSupabaseAdminClient: vi.fn(async () => supabase) }));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    const recent = new Date().toISOString();
    supabase = mockSupabaseClient({
        tables: {
            ai_cost_events: {
                data: [
                    { created_at: recent, estimated_usd: 0.12, total_tokens: 1000, model_name: 'gemini-2.5-flash', endpoint: 'diagnose/classify', conversation_id: 'c1' },
                ],
                error: null,
            },
        },
    });
});

describe('GET /api/admin/ai-costs/summary', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs/summary' }));
        expect(res.status).toBe(401);
    });

    it('returns the summary shape', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs/summary' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('monthToDate');
        expect(body).toHaveProperty('lastMonth');
        expect(body).toHaveProperty('byModel');
        expect(body).toHaveProperty('byEndpoint');
        expect(body).toHaveProperty('projection');
        expect(body.projection).toHaveProperty('runRateUsd');
    });
});
