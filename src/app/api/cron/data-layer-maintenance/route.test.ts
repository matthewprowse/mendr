import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    supabase = mockSupabaseClient({
        rpc: { run_data_layer_maintenance: { data: { purged: 12 }, error: null } },
    });
});

describe('GET /api/cron/data-layer-maintenance', () => {
    it('returns 401 without the cron secret', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/data-layer-maintenance' }));
        expect(res.status).toBe(401);
    });

    it('returns 401 when the bearer token is wrong', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({
                path: '/api/cron/data-layer-maintenance',
                headers: { authorization: 'Bearer wrong' },
            }),
        );
        expect(res.status).toBe(401);
    });

    it('runs the maintenance RPC and returns ok with results', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cron/data-layer-maintenance', cron: true }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.result).toEqual({ purged: 12 });
        expect(supabase.rpc).toHaveBeenCalledWith('run_data_layer_maintenance');
    });

    it('returns 500 when the RPC errors', async () => {
        supabase = mockSupabaseClient({
            rpc: { run_data_layer_maintenance: { data: null, error: { message: 'rpc fail' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cron/data-layer-maintenance', cron: true }),
        );
        expect(res.status).toBe(500);
    });
});
