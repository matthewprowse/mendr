import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
}));

function anon() {
    serverClient = mockSupabaseClient({ user: null });
}
function authed(tables: Record<string, { data: unknown; error: unknown }> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' }, tables });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/account/notification-preferences', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns defaults when no row exists', async () => {
        authed({ notification_preferences: { data: null, error: null } });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body.followup_enabled).toBe(true);
        expect(body.product_updates_enabled).toBe(true);
    });

    it('returns stored preferences', async () => {
        authed({ notification_preferences: { data: { followup_enabled: false, rating_enabled: true, reengagement_enabled: false, product_updates_enabled: true }, error: null } });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body.followup_enabled).toBe(false);
    });
});

describe('PATCH /api/account/notification-preferences', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { rating_enabled: false } }))).status).toBe(401);
    });

    it('400 when no valid boolean fields are provided', async () => {
        authed();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { unknown: true } }))).status).toBe(400);
    });

    it('upserts valid fields', async () => {
        authed({ notification_preferences: { data: null, error: null } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { rating_enabled: false, followup_enabled: true } }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
