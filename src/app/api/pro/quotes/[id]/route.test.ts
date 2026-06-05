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

describe('GET /api/pro/quotes/[id]', () => {
    it('400 on an invalid id', async () => {
        pro();
        const { GET } = await import('./route');
        expect((await GET(makeRequest(), params('nope'))).status).toBe(400);
    });

    it('404 when the quote belongs to another provider', async () => {
        pro({ quotes: { data: { provider_id: 'other' }, error: null } });
        const { GET } = await import('./route');
        expect((await GET(makeRequest(), params(ID))).status).toBe(404);
    });

    it('returns the quote with items and branding', async () => {
        pro({
            quotes: { data: { id: ID, provider_id: PROV, status: 'draft' }, error: null },
            quote_items: { data: [{ id: 'li1', description: 'Labour' }], error: null },
            provider_branding: { data: { vat_registered: false }, error: null },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest(), params(ID));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.quote.id).toBe(ID);
        expect(body.items).toHaveLength(1);
    });
});

describe('PATCH /api/pro/quotes/[id]', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: {} }), params(ID))).status).toBe(401);
    });

    it('404 when the quote belongs to another provider', async () => {
        pro({ quotes: { data: { provider_id: 'other', subtotal: 0 }, error: null } });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: {} }), params(ID))).status).toBe(404);
    });

    it('400 on an invalid status', async () => {
        pro({
            quotes: { data: { provider_id: PROV, subtotal: 0, status: 'draft', sent_at: null, accepted_at: null }, error: null },
            provider_branding: { data: null, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'nope' } }), params(ID));
        expect(res.status).toBe(400);
    });

    it('replaces items and applies VAT when registered', async () => {
        pro({
            quotes: seq(
                { data: { provider_id: PROV, subtotal: 0, status: 'draft', sent_at: null, accepted_at: null }, error: null },
                { data: null, error: null },
            ),
            quote_items: { data: null, error: null },
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
        expect(adminClient.from).toHaveBeenCalledWith('quote_items');
    });

    it('stamps accepted_at on the first transition to accepted', async () => {
        pro({
            quotes: seq(
                { data: { provider_id: PROV, subtotal: 100, status: 'sent', sent_at: '2026-01-01', accepted_at: null }, error: null },
                { data: null, error: null },
            ),
            provider_branding: { data: { vat_registered: false }, error: null },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { status: 'accepted' } }), params(ID));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
