import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

function authed(existingSave: { id: string } | null = null) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: { saved_providers: { data: existingSave, error: null } },
    });
}

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/account/saved-providers', () => {
    it('returns { saved: false } when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/account/saved-providers?providerId=p1' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.saved).toBe(false);
    });

    it('returns 400 when providerId missing', async () => {
        authed();
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/account/saved-providers' }));
        expect(res.status).toBe(400);
    });

    it('returns { saved: true } when row exists', async () => {
        authed({ id: 'sp1' });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/account/saved-providers?providerId=p1' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.saved).toBe(true);
    });
});

describe('POST /api/account/saved-providers', () => {
    it('returns 401 when unauthenticated', async () => {
        anon();
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: 'p1' } }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when providerId missing', async () => {
        authed();
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('toggles off when already saved', async () => {
        authed({ id: 'sp1' });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: 'p1' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.saved).toBe(false);
    });

    it('toggles on when not saved', async () => {
        authed(null);
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { providerId: 'p1' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.saved).toBe(true);
    });
});
