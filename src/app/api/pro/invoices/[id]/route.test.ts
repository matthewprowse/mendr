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

function pro(
    tables: Record<string, SupabaseQueryResult | ChainResolver> = {},
    rpc?: Record<string, SupabaseQueryResult>,
) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: { providers: { data: [{ id: PROV }], error: null }, ...tables },
        rpc,
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/invoices/[id]', () => {
    it('400 on an invalid id', async () => {
        pro();
        const { GET } = await import('./route');
        expect((await GET(makeRequest(), params('nope'))).status).toBe(400);
    });

    it('404 when the invoice belongs to another provider', async () => {
        pro({ invoices: { data: { provider_id: 'other' }, error: null } });
        const { GET } = await import('./route');
        expect((await GET(makeRequest(), params(ID))).status).toBe(404);
    });

    it('returns the invoice with items and branding', async () => {
        pro({
            invoices: { data: { id: ID, provider_id: PROV, status: 'draft' }, error: null },
            invoice_items: { data: [{ description: 'Labour' }], error: null },
            provider_branding: { data: { vat_registered: true }, error: null },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest(), params(ID));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.invoice.id).toBe(ID);
        expect(body.items).toEqual([{ description: 'Labour' }]);
        expect(body.branding).toEqual({ vat_registered: true });
    });
});

describe('PATCH /api/pro/invoices/[id] — issue', () => {
    it('assigns a gap-free number, locks, and marks sent', async () => {
        pro(
            {
                invoices: seq(
                    { data: { provider_id: PROV, status: 'draft', issued_at: null, amount_paid: 0, total: 115 }, error: null },
                    { data: null, error: null },
                ),
            },
            { next_invoice_seq: { data: 7, error: null } },
        );
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'issue' } }), params(ID));
        expect(res.status).toBe(200);
        expect((await res.json()).number).toBe('INV-0007');
    });

    it('409 when the invoice is already issued', async () => {
        pro({
            invoices: { data: { provider_id: PROV, status: 'sent', issued_at: '2026-01-01', amount_paid: 0, total: 115 }, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'issue' } }), params(ID));
        expect(res.status).toBe(409);
    });
});

describe('PATCH /api/pro/invoices/[id] — payment', () => {
    it('400 on a non-positive amount', async () => {
        pro({
            invoices: { data: { provider_id: PROV, status: 'sent', issued_at: '2026-01-01', amount_paid: 0, total: 115 }, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'payment', amount: 0 } }), params(ID));
        expect(res.status).toBe(400);
    });

    it('records a partial payment', async () => {
        pro({
            invoices: seq(
                { data: { provider_id: PROV, status: 'sent', issued_at: '2026-01-01', amount_paid: 0, total: 115 }, error: null },
                { data: null, error: null },
            ),
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'payment', amount: 50 } }), params(ID));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.amount_paid).toBe(50);
        expect(body.status).toBe('partial');
    });

    it('marks paid when the payment covers the total', async () => {
        pro({
            invoices: seq(
                { data: { provider_id: PROV, status: 'partial', issued_at: '2026-01-01', amount_paid: 100, total: 115 }, error: null },
                { data: null, error: null },
            ),
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { action: 'payment', amount: 15 } }), params(ID));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.amount_paid).toBe(115);
        expect(body.status).toBe('paid');
    });
});

describe('PATCH /api/pro/invoices/[id] — edit', () => {
    it('409 when editing an issued invoice', async () => {
        pro({
            invoices: { data: { provider_id: PROV, status: 'sent', issued_at: '2026-01-01', amount_paid: 0, total: 115, subtotal: 100 }, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { terms: 'new terms' } }),
            params(ID),
        );
        expect(res.status).toBe(409);
    });

    it('edits a draft, recomputing totals with VAT when registered', async () => {
        pro({
            invoices: seq(
                { data: { provider_id: PROV, status: 'draft', issued_at: null, amount_paid: 0, total: 0, subtotal: 0 }, error: null },
                { data: null, error: null },
            ),
            invoice_items: { data: null, error: null },
            provider_branding: { data: { vat_registered: true }, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({
                method: 'PATCH',
                body: { items: [{ description: 'Labour', qty: 2, unitPrice: 100 }] },
            }),
            params(ID),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(adminClient.from).toHaveBeenCalledWith('invoice_items');
    });

    it('404 when the invoice belongs to another provider', async () => {
        pro({ invoices: { data: { provider_id: 'other', issued_at: null }, error: null } });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { terms: 'x' } }), params(ID))).status).toBe(404);
    });
});
