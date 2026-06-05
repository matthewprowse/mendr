import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/account/export', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns a downloadable JSON bundle of the user data', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1', email: 'a@b.co' } });
        adminClient = mockSupabaseClient({
            tables: {
                profiles: { data: { first_name: 'Ada', surname: 'L', username: 'ada', description: '', locations: [], created_at: 't' }, error: null },
                diagnoses: { data: [{ id: 'd1', title: 'Leak', customer_address: 'x', diagnosis: 'y', created_at: 't' }], error: null },
                saved_providers: { data: [{ provider_id: 'p1', created_at: 't' }], error: null },
                provider_contact_events: { data: [{ id: 'e1', channel: 'whatsapp', created_at: 't', conversation_id: 'd1' }], error: null },
            },
        });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect(res.headers.get('content-disposition')).toContain('attachment');
        const body = await res.json();
        expect(body.account.email).toBe('a@b.co');
        expect(body.requests).toHaveLength(1);
        expect(body.saved_contractors).toHaveLength(1);
        expect(body.contact_history).toHaveLength(1);
    });
});
