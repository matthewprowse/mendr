import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient; // user-bound (for auth.getUser)
let adminClient: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

function setupAuthed(locations: unknown[] = []) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({
        tables: { profiles: { data: { locations }, error: null } },
    });
}

function setupAnon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/account/locations', () => {
    it('returns 401 when unauthenticated', async () => {
        setupAnon();
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/account/locations' }));
        expect(res.status).toBe(401);
    });

    it('returns the user locations', async () => {
        setupAuthed([{ id: 'l1', label: 'Home', address: '123 St' }]);
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/account/locations' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.locations).toHaveLength(1);
    });
});

describe('POST /api/account/locations', () => {
    it('returns 401 when unauthenticated', async () => {
        setupAnon();
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { label: 'Home', address: '1 St' } }),
        );
        expect(res.status).toBe(401);
    });

    it('returns 400 when label is missing', async () => {
        setupAuthed();
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { address: '1 St' } }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when address > 200 chars', async () => {
        setupAuthed();
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { label: 'X', address: 'a'.repeat(201) } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 409 when 10 locations already exist', async () => {
        setupAuthed(
            Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, label: `L${i}`, address: 'a' })),
        );
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { label: 'Eleven', address: '1 St' } }),
        );
        expect(res.status).toBe(409);
    });

    it('returns the new location on success', async () => {
        setupAuthed();
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { label: 'Home', address: '1 St', lat: 1, lng: 2 } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.location.label).toBe('Home');
    });
});

describe('DELETE /api/account/locations', () => {
    it('returns 401 when unauthenticated', async () => {
        setupAnon();
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ path: '/api/account/locations?id=l1' }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        setupAuthed();
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ path: '/api/account/locations' }));
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        setupAuthed([{ id: 'l1', label: 'Home', address: '1 St' }]);
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ path: '/api/account/locations?id=l1' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });
});
