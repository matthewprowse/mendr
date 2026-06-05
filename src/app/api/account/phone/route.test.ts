import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}
function authed(
    serverTables: Record<string, { data: unknown; error: unknown }> = {},
    adminTables: Record<string, { data: unknown; error: unknown }> = {},
) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' }, tables: serverTables });
    adminClient = mockSupabaseClient({ tables: adminTables });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/account/phone', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns phone and verified flag', async () => {
        authed({ profiles: { data: { phone: '27821234567', phone_verified_at: '2026-01-01' }, error: null } });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body).toEqual({ phone: '27821234567', verified: true });
    });
});

describe('POST /api/account/phone', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { phone: '0821234567' } }))).status).toBe(401);
    });

    it('400 when the number is missing', async () => {
        authed();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: {} }))).status).toBe(400);
    });

    it('400 on a non-mobile SA number', async () => {
        authed();
        const { POST } = await import('./route');
        // 011 is a Johannesburg landline, not a mobile
        expect((await POST(makeRequest({ method: 'POST', body: { phone: '0111234567' } }))).status).toBe(400);
    });

    it('normalises and stores a valid mobile', async () => {
        authed({}, { profiles: { data: null, error: null } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { phone: '082 123 4567' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).phone).toBe('27821234567');
    });

    it('500 when the update errors', async () => {
        authed({}, { profiles: { data: null, error: { message: 'db' } } });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { phone: '0821234567' } }))).status).toBe(500);
    });
});
