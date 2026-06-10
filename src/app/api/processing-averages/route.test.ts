import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/processing-averages', () => {
    it('returns null averages when no data exists', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                ai_cost_events: { data: [], error: null },
            },
        });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.classifyMs).toBeNull();
        expect(body.proseMs).toBeNull();
        expect(body.sampleSize).toBe(0);
    });

    it('returns 200 with null values on DB error (caller falls back to defaults)', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                ai_cost_events: { data: null, error: { message: 'db error' } },
            },
        });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.classifyMs).toBeNull();
        expect(body.sampleSize).toBe(0);
    });

    it('returns computed average when data is present', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                ai_cost_events: {
                    data: [{ latency_ms: 1000 }, { latency_ms: 2000 }],
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        // With 5 endpoints all returning 1500ms average, classifyMs should be 1500
        expect(body.classifyMs).toBe(1500);
        expect(body.sampleSize).toBeGreaterThan(0);
    });
});
