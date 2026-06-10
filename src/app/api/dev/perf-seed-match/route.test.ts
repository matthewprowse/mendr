import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

// NODE_ENV is read-only on the process.env object in some Node modes — use
// vi.stubEnv to manipulate it for these tests.

beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    supabase = mockSupabaseClient({
        tables: { diagnoses: { data: null, error: null } },
    });
});

describe('POST /api/dev/perf-seed-match', () => {
    it('returns 404 outside development', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(404);
    });

    it('returns 200 + conversationId in development', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { trade: 'Plumbing' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBeTruthy();
    });

    it('returns 400 when trade is N/A', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { trade: 'n/a' } }));
        expect(res.status).toBe(400);
    });
});
