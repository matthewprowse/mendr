import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
    type SupabaseQueryResult,
    type ChainResolver,
} from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const PROV = 'prov-1';
const ID = '11111111-1111-4111-8111-111111111111';

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

function params(id: string) {
    return { params: Promise.resolve({ id }) };
}

function pro(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: { providers: { data: [{ id: PROV }], error: null }, ...tables },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/pro/jobs/[id]', () => {
    it('400 on an invalid id', async () => {
        pro();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { title: 'X' } }), params('nope'))).status).toBe(400);
    });

    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { title: 'X' } }), params(ID))).status).toBe(401);
    });

    it('400 when there is nothing to update', async () => {
        pro();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: {} }), params(ID))).status).toBe(400);
    });

    it('400 on an invalid status', async () => {
        pro();
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'flying' } }), params(ID));
        expect(res.status).toBe(400);
    });

    it('404 when the job belongs to another provider', async () => {
        pro({ jobs: { data: { provider_id: 'other' }, error: null } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'completed' } }), params(ID));
        expect(res.status).toBe(404);
    });

    it('updates an owned job', async () => {
        pro({ jobs: seq({ data: { provider_id: PROV }, error: null }, { data: null, error: null }) });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'completed' } }), params(ID));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
