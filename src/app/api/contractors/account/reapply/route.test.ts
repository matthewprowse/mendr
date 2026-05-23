import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

function setup(user: { id: string } | null, opts: {
    original?: unknown;
    existing?: unknown;
} = {}) {
    serverClient = mockSupabaseClient({ user });
    // Track which terminal awaitable to resolve: 1=original select,
    // 2=existing select, 3=insert.
    let phase = 0;
    adminClient = mockSupabaseClient({
        tables: {
            provider_applications: () => {
                phase += 1;
                if (phase === 1) return { data: opts.original ?? null, error: null };
                if (phase === 2) return { data: opts.existing ?? null, error: null };
                return { data: { id: 'new-app-1' }, error: null };
            },
        },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/contractors/account/reapply', () => {
    it('returns 401 when unauthenticated', async () => {
        setup(null);
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { applicationId: 'old' } }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when applicationId missing', async () => {
        setup({ id: 'user-1' });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns 404 when application not found or not rejected', async () => {
        setup({ id: 'user-1' }, { original: null });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { applicationId: 'missing' } }));
        expect(res.status).toBe(404);
    });

    it('returns ok with new id on success', async () => {
        setup(
            { id: 'user-1' },
            {
                original: { id: 'old', trade: 'Plumbing', email: 'a@b.com', status: 'rejected' },
            },
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { applicationId: 'old' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe('new-app-1');
    });
});
