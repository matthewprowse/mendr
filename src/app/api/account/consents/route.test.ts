import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/account/consents', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('500 when the query errors', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({ tables: { lead_contact_consents: { data: null, error: { message: 'db' } } } });
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(500);
    });

    it('dedupes to one entry per specialist with the business name', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                lead_contact_consents: {
                    data: [
                        { provider_id: 'p1', granted_at: '2026-02-01', providers: { name: 'Acme Plumbing' } },
                        { provider_id: 'p1', granted_at: '2026-01-01', providers: { name: 'Acme Plumbing' } },
                        { provider_id: 'p2', granted_at: '2026-01-15', providers: null },
                    ],
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body.specialists).toHaveLength(2);
        expect(body.specialists[0]).toEqual({ provider_id: 'p1', name: 'Acme Plumbing', granted_at: '2026-02-01' });
        expect(body.specialists[1].name).toBe('A specialist');
    });
});
