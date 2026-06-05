import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const GOOGLE_KEYS = ['GOOGLE_PLACES_API_KEY', 'NEXT_PUBLIC_GOOGLE_PLACES_API_KEY', 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    for (const k of GOOGLE_KEYS) {
        savedEnv[k] = process.env[k];
        delete process.env[k];
    }
});
afterEach(() => {
    for (const k of GOOGLE_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
    vi.unstubAllGlobals();
});

function req(q?: string) {
    return makeRequest({ path: q === undefined ? '/api/providers/search' : `/api/providers/search?q=${encodeURIComponent(q)}` });
}

describe('GET /api/providers/search', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET(req('acme'))).status).toBe(401);
    });

    it('returns no results for a query shorter than 2 chars', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        const res = await GET(req('a'));
        expect(res.status).toBe(200);
        expect((await res.json()).results).toEqual([]);
    });

    it('returns database results tagged source=database', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        adminClient = mockSupabaseClient({
            tables: { providers: { data: [{ id: 'p1', google_place_id: null, name: 'Acme', address: '1 Rd', rating: 4.2 }], error: null } },
        });
        const { GET } = await import('./route');
        const body = await (await GET(req('acme'))).json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0]).toMatchObject({ id: 'p1', name: 'Acme', source: 'database' });
    });

    it('falls back to Google Places when the database has no matches', async () => {
        process.env.GOOGLE_PLACES_API_KEY = 'test-key';
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        adminClient = mockSupabaseClient({ tables: { providers: { data: [], error: null } } });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ results: [{ place_id: 'g1', name: 'Google Co', formatted_address: '5 Ave', rating: 3.9 }] }),
        })));
        const { GET } = await import('./route');
        const body = await (await GET(req('acme'))).json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0]).toMatchObject({ id: 'g1', googlePlaceId: 'g1', source: 'google' });
    });

    it('returns empty when there are no DB matches and no API key', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        adminClient = mockSupabaseClient({ tables: { providers: { data: [], error: null } } });
        const { GET } = await import('./route');
        expect((await (await GET(req('acme'))).json()).results).toEqual([]);
    });

    it('returns empty when the Google fetch fails', async () => {
        process.env.GOOGLE_PLACES_API_KEY = 'test-key';
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        adminClient = mockSupabaseClient({ tables: { providers: { data: [], error: null } } });
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
        const { GET } = await import('./route');
        expect((await (await GET(req('acme'))).json()).results).toEqual([]);
    });
});
