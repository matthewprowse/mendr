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

describe('GET /api/pro/invoices', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('403 when no claimed provider', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [], error: null },
            },
        });
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(403);
    });

    it('lists invoices', async () => {
        pro({ invoices: { data: [{ id: 'inv1', number: 'INV-0001' }], error: null } });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        expect((await res.json()).invoices).toEqual([{ id: 'inv1', number: 'INV-0001' }]);
    });
});

describe('POST /api/pro/invoices', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: {} }))).status).toBe(401);
    });

    it('creates a blank draft invoice', async () => {
        pro({ invoices: { data: { id: 'inv1' }, error: null } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(200);
        expect((await res.json()).id).toBe('inv1');
    });

    it('404 when creating from a quote owned by another provider', async () => {
        pro({ quotes: { data: { provider_id: 'other', total: 100 }, error: null } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { quoteId: 'q1' } }));
        expect(res.status).toBe(404);
    });

    it('creates a draft from an accepted quote, copying items', async () => {
        pro({
            quotes: {
                data: {
                    provider_id: PROV,
                    customer_id: 'c1',
                    subtotal: 100,
                    vat_amount: 15,
                    total: 115,
                    deposit_percent: 10,
                    terms: 'Net 30',
                },
                error: null,
            },
            quote_items: {
                data: [{ description: 'Labour', qty: 1, unit_price: 100, line_total: 100, position: 0 }],
                error: null,
            },
            invoices: { data: { id: 'inv1' }, error: null },
            invoice_items: { data: null, error: null },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { quoteId: 'q1' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).id).toBe('inv1');
        // The copy path queried the quote items and wrote invoice items.
        expect(adminClient.from).toHaveBeenCalledWith('quote_items');
        expect(adminClient.from).toHaveBeenCalledWith('invoice_items');
    });

    it('500 when the insert fails', async () => {
        pro({ invoices: { data: null, error: { message: 'nope' } } });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: {} }))).status).toBe(500);
    });
});
