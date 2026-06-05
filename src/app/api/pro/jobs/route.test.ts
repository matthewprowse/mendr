import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

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

function pro(tables: Record<string, { data: unknown; error: unknown }> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: { providers: { data: [{ id: PROV }], error: null }, ...tables },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/pro/jobs', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns the provider jobs', async () => {
        pro({ jobs: { data: [{ id: 'j1', title: 'Fix tap' }], error: null } });
        const { GET } = await import('./route');
        const res = await GET();
        expect(res.status).toBe(200);
        expect((await res.json()).jobs).toEqual([{ id: 'j1', title: 'Fix tap' }]);
    });

    it('500 when the query errors', async () => {
        pro({ jobs: { data: null, error: { message: 'boom' } } });
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(500);
    });
});

describe('POST /api/pro/jobs', () => {
    it('403 when the user has no claimed provider', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: [], error: null },
                provider_applications: { data: [], error: null },
                provider_members: { data: [], error: null },
            },
        });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { title: 'X' } }))).status).toBe(403);
    });

    it('400 when the title is missing', async () => {
        pro();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { title: '   ' } }))).status).toBe(400);
    });

    it('creates a job', async () => {
        pro({ jobs: { data: { id: 'j1', title: 'Fix tap' }, error: null } });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { title: '  Fix tap ', site_address: 'Cape Town' } }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).job).toEqual({ id: 'j1', title: 'Fix tap' });
    });
});
