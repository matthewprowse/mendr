import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient, type SupabaseQueryResult } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
}));

function anon() {
    serverClient = mockSupabaseClient({ user: null });
}
function authed(tables: Record<string, SupabaseQueryResult> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' }, tables });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/account/consent-settings', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('defaults to ask_each_time when no row exists', async () => {
        authed({ lead_share_consent_settings: { data: null, error: null } });
        const { GET } = await import('./route');
        expect((await (await GET()).json()).mode).toBe('ask_each_time');
    });

    it('returns the stored mode', async () => {
        authed({ lead_share_consent_settings: { data: { mode: 'always_share' }, error: null } });
        const { GET } = await import('./route');
        expect((await (await GET()).json()).mode).toBe('always_share');
    });
});

describe('PATCH /api/account/consent-settings', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { mode: 'always_share' } }))).status).toBe(401);
    });

    it('400 on an invalid mode', async () => {
        authed();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { mode: 'never' } }))).status).toBe(400);
    });

    it('upserts a valid mode', async () => {
        authed({ lead_share_consent_settings: { data: null, error: null } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { mode: 'always_share' } }));
        expect(res.status).toBe(200);
        expect((await res.json()).mode).toBe('always_share');
    });
});
