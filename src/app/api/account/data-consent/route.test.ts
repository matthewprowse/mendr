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

describe('GET /api/account/data-consent', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET()).status).toBe(401);
    });

    it('returns defaults when no row exists', async () => {
        authed({ user_data_consent: { data: null, error: null } });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body).toEqual({ product_analytics: true, model_training: false });
    });

    it('returns the stored consent', async () => {
        authed({ user_data_consent: { data: { product_analytics: false, model_training: true }, error: null } });
        const { GET } = await import('./route');
        const body = await (await GET()).json();
        expect(body).toEqual({ product_analytics: false, model_training: true });
    });
});

describe('PATCH /api/account/data-consent', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { model_training: true } }))).status).toBe(401);
    });

    it('400 when no valid boolean fields are provided', async () => {
        authed();
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { model_training: 'yes' } }))).status).toBe(400);
    });

    it('upserts valid boolean fields', async () => {
        authed({ user_data_consent: { data: null, error: null } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { product_analytics: false, model_training: true } }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });

    it('500 when the upsert errors', async () => {
        authed({ user_data_consent: { data: null, error: { message: 'db' } } });
        const { PATCH } = await import('./route');
        expect((await PATCH(makeRequest({ method: 'PATCH', body: { model_training: true } }))).status).toBe(500);
    });
});
