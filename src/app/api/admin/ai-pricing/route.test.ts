import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
    type SupabaseQueryResult,
    type ChainResolver,
} from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;
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
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));
vi.mock('@/lib/ai/ai-cost-logger', () => ({ invalidatePricingCache: vi.fn() }));

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

const VALID = {
    model_name: 'gemini-2.5-flash',
    input_per_1m_usd: 0.3,
    output_per_1m_usd: 2.5,
    source: 'manual',
};

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
});

describe('GET /api/admin/ai-pricing', () => {
    it('401 when not admin', async () => {
        denyAdmin = true;
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET(makeRequest())).status).toBe(401);
    });

    it('returns the active pricing rows', async () => {
        adminClient = mockSupabaseClient({ tables: { ai_model_pricing: { data: [{ id: 'r1', model_name: 'gemini-2.5-flash' }], error: null } } });
        const { GET } = await import('./route');
        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        expect((await res.json()).rows).toHaveLength(1);
    });

    it('500 when the query errors', async () => {
        adminClient = mockSupabaseClient({ tables: { ai_model_pricing: { data: null, error: { message: 'db' } } } });
        const { GET } = await import('./route');
        expect((await GET(makeRequest())).status).toBe(500);
    });
});

describe('POST /api/admin/ai-pricing', () => {
    it('401 when not admin', async () => {
        denyAdmin = true;
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: VALID }))).status).toBe(401);
    });

    it('400 on invalid JSON', async () => {
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', rawBody: '{not json', headers: { 'content-type': 'application/json' } }))).status).toBe(400);
    });

    it('400 when model_name is missing', async () => {
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { ...VALID, model_name: '' } }))).status).toBe(400);
    });

    it('400 on a negative input rate', async () => {
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { ...VALID, input_per_1m_usd: -1 } }))).status).toBe(400);
    });

    it('closes the active row, inserts a new one and invalidates the cache', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                ai_model_pricing: seq(
                    { data: null, error: null }, // close-out update
                    { data: { id: 'r2', model_name: 'gemini-2.5-flash' }, error: null }, // insert
                ),
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: VALID }));
        expect(res.status).toBe(200);
        expect((await res.json()).row).toMatchObject({ id: 'r2' });
        const { invalidatePricingCache } = await import('@/lib/ai/ai-cost-logger');
        expect(invalidatePricingCache).toHaveBeenCalled();
    });
});
