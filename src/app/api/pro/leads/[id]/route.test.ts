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

describe('PATCH /api/pro/leads/[id]', () => {
    it('400 on an invalid id', async () => {
        pro();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { status: 'won' } }), params('nope'))).status).toBe(400);
    });

    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { status: 'won' } }), params(ID))).status).toBe(401);
    });

    it('400 on an invalid status', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { status: 'maybe' } }), params(ID))).status).toBe(400);
    });

    it('400 when there is nothing to update', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: {} }), params(ID))).status).toBe(400);
    });

    it('403 when the user has no claimed provider', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [], error: null },
            },
        });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { status: 'won' } }), params(ID))).status).toBe(403);
    });

    it('404 when the lead belongs to another provider', async () => {
        pro({ provider_contact_events: { data: { provider_id: 'other' }, error: null } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'responded' } }), params(ID));
        expect(res.status).toBe(404);
    });

    it('updates the lead status and notes', async () => {
        pro({
            provider_contact_events: { data: { provider_id: PROV }, error: null },
            lead_states: { data: null, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { status: 'responded', notes: '  called back ' } }),
            params(ID),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.status).toBe('responded');
        expect(body.notes).toBe('called back');
    });

    it('best-effort creates a job when the lead is won', async () => {
        pro({
            // 1st query: ownership check; 2nd query: diagnoses lookup for the job
            provider_contact_events: seq(
                { data: { provider_id: PROV }, error: null },
                { data: { diagnoses: { title: 'Leaking geyser', customer_address: '1 A St, Newlands', user_id: 'h1' } }, error: null },
            ),
            lead_states: { data: null, error: null },
            provider_customers: { data: { id: 'c1' }, error: null },
            jobs: { data: null, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'won' } }), params(ID));
        expect(res.status).toBe(200);
        // The job upsert ran against the jobs table.
        expect(adminClient.from).toHaveBeenCalledWith('jobs');
    });
});
