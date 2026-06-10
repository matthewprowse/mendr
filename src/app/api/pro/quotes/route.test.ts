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

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}

function pro(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: { providers: { data: [{ id: PROV }], error: null }, ...tables },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/quotes', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('lists quotes', async () => {
        pro({ quotes: { data: [{ id: 'q1', number: 'Q-0001' }], error: null } });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        expect((await res.json()).quotes).toEqual([{ id: 'q1', number: 'Q-0001' }]);
    });
});

describe('POST /api/pro/quotes', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: {} }))).status).toBe(401);
    });

    it('creates a blank draft quote with a per-provider number', async () => {
        pro({
            // count query, then insert
            quotes: seq({ data: null, error: null, count: 2 }, { data: { id: 'q1' }, error: null }),
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(200);
        expect((await res.json()).id).toBe('q1');
    });

    it('pre-fills from a lead, seeding a line item', async () => {
        pro({
            quotes: seq({ data: null, error: null, count: 0 }, { data: { id: 'q1' }, error: null }),
            provider_contact_events: {
                data: { provider_id: PROV, diagnoses: { title: 'Burst pipe', user_id: 'h1' } },
                error: null,
            },
            provider_customers: { data: { id: 'c1' }, error: null },
            quote_items: { data: null, error: null },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { contactEventId: 'ev1' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).id).toBe('q1');
        expect(adminClient.from).toHaveBeenCalledWith('quote_items');
    });

    it('500 when the insert fails', async () => {
        pro({ quotes: seq({ data: null, error: null, count: 0 }, { data: null, error: { message: 'nope' } }) });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: {} }))).status).toBe(500);
    });
});
