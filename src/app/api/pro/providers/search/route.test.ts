/**
 * Contract tests for GET /api/pro/providers/search (claim-search).
 *
 * Covers: auth gate, the min-query short-circuit, the happy path with
 * lead-count enrichment and waiting-leads-first ordering, null-field
 * defaults, and DB error → 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const USER = { id: 'user-1', email: 'pro@example.com' };

beforeEach(() => {
    vi.clearAllMocks();
    serverClient = mockSupabaseClient({ user: USER });
    adminClient = mockSupabaseClient({
        tables: {
            providers: { data: [], error: null },
            provider_contact_events: { data: [], error: null },
        },
    });
});

function searchRequest(q: string): ReturnType<typeof makeRequest> {
    return makeRequest({ path: `/api/pro/providers/search?q=${encodeURIComponent(q)}` });
}

describe('GET /api/pro/providers/search — auth and validation', () => {
    it('returns 401 when not signed in', async () => {
        serverClient = mockSupabaseClient({ user: null });
        const { GET } = await import('./route');
        const res = await GET(searchRequest('plumb'));
        expect(res.status).toBe(401);
    });

    it('returns an empty list for queries shorter than 2 chars', async () => {
        const { GET } = await import('./route');
        const res = await GET(searchRequest('p'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ providers: [] });
    });

    it('treats a whitespace-only query as empty', async () => {
        const { GET } = await import('./route');
        const res = await GET(searchRequest('   '));
        expect(await res.json()).toEqual({ providers: [] });
    });
});

describe('GET /api/pro/providers/search — results', () => {
    it('returns 500 when the providers query errors', async () => {
        adminClient = mockSupabaseClient({
            tables: { providers: { data: null, error: { message: 'db down' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(searchRequest('plumb'));
        expect(res.status).toBe(500);
    });

    it('enriches with lead counts and sorts waiting-leads first', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: [
                        { id: 'a', name: 'Alpha Plumbing', address: '1 Main Rd' },
                        { id: 'b', name: 'Bravo Plumbing', address: '2 Side St' },
                    ],
                    error: null,
                },
                provider_contact_events: {
                    data: [
                        { provider_id: 'b' },
                        { provider_id: 'b' },
                        { provider_id: 'a' },
                    ],
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(searchRequest('plumb'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.providers).toEqual([
            { id: 'b', name: 'Bravo Plumbing', address: '2 Side St', leads: 2 },
            { id: 'a', name: 'Alpha Plumbing', address: '1 Main Rd', leads: 1 },
        ]);
    });

    it('defaults null name/address and zero leads', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [{ id: 'x', name: null, address: null }], error: null },
                provider_contact_events: { data: [], error: null },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(searchRequest('plumb'));
        const body = await res.json();
        expect(body.providers).toEqual([
            { id: 'x', name: 'Unnamed business', address: '', leads: 0 },
        ]);
    });
});
