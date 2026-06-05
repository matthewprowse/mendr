import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
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

beforeEach(() => vi.clearAllMocks());

function authed(tables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({ tables });
}

describe('GET /api/account/saved-providers/list', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns an empty list when nothing is saved', async () => {
        authed({ saved_providers: { data: [], error: null } });
        const { GET } = await import('./route');
        expect((await (await GET()).json()).providers).toEqual([]);
    });

    it('joins saved rows to providers and drops inactive ones', async () => {
        authed({
            saved_providers: {
                data: [
                    { id: 's1', provider_id: 'p1', created_at: '2026-05-02' },
                    { id: 's2', provider_id: 'p2', created_at: '2026-05-01' },
                ],
                error: null,
            },
            providers: {
                data: [
                    { id: 'p1', google_place_id: null, name: 'Acme', address: '1 Rd', rating: 4.5, rating_count: 12, specialisations: ['plumbing'], is_active: true },
                    { id: 'p2', google_place_id: null, name: 'Gone Co', address: null, rating: null, rating_count: 0, specialisations: [], is_active: false },
                ],
                error: null,
            },
        });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body.providers).toHaveLength(1);
        expect(body.providers[0]).toMatchObject({ savedId: 's1', providerId: 'p1', name: 'Acme' });
    });

    it('returns a 200 with an error field when the saved query fails', async () => {
        authed({ saved_providers: { data: null, error: { message: 'db' } } });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.providers).toEqual([]);
        expect(body.error).toBe('db');
    });
});
