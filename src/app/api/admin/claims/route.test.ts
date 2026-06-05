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

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
});

describe('GET /api/admin/claims', () => {
    it('401 when not admin', async () => {
        denyAdmin = true;
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET(makeRequest())).status).toBe(401);
    });

    it('returns pending claims with lead counts', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                provider_claims: { data: [{ id: 'c1', provider_id: 'p1', user_id: 'u1', created_at: 't', providers: { name: 'Acme', address: '1 Rd' } }], error: null },
                provider_contact_events: { data: [{ provider_id: 'p1' }, { provider_id: 'p1' }], error: null },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ id: 'c1', providerName: 'Acme', leads: 2 });
    });

    it('500 when the query errors', async () => {
        adminClient = mockSupabaseClient({ tables: { provider_claims: { data: null, error: { message: 'db' } } } });
        const { GET } = await import('./route');
        expect((await GET(makeRequest())).status).toBe(500);
    });
});

describe('PATCH /api/admin/claims', () => {
    it('401 when not admin', async () => {
        denyAdmin = true;
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { id: 'c1', action: 'approve' } }))).status).toBe(401);
    });

    it('400 when id is missing', async () => {
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { action: 'approve' } }))).status).toBe(400);
    });

    it('400 on an invalid action', async () => {
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { id: 'c1', action: 'maybe' } }))).status).toBe(400);
    });

    it('404 when the claim is missing or already reviewed', async () => {
        adminClient = mockSupabaseClient({ tables: { provider_claims: { data: { id: 'c1', provider_id: 'p1', user_id: 'u1', status: 'approved' }, error: null } } });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { id: 'c1', action: 'approve' } }))).status).toBe(404);
    });

    it('approves a pending claim and links the provider', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                provider_claims: seq(
                    { data: { id: 'c1', provider_id: 'p1', user_id: 'u1', status: 'pending' }, error: null },
                    { data: null, error: null },
                ),
                providers: { data: null, error: null },
            },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'c1', action: 'approve' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(adminClient.from).toHaveBeenCalledWith('providers');
    });

    it('rejects a pending claim without linking', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                provider_claims: seq(
                    { data: { id: 'c1', provider_id: 'p1', user_id: 'u1', status: 'pending' }, error: null },
                    { data: null, error: null },
                ),
            },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { id: 'c1', action: 'reject' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
