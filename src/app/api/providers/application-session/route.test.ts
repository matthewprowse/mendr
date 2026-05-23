import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: { provider_applications: { data: { id: 'a1' }, error: null } },
    });
});

describe('GET /api/providers/application-session', () => {
    it('returns null application when no phone or ip', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/application-session' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.application).toBeNull();
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({
                path: '/api/providers/application-session?phone=x',
                headers: { 'x-forwarded-for': '1.2.3.4' },
            }),
        );
        expect(res.status).toBe(500);
    });

    it('returns the application on success', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({
                path: '/api/providers/application-session?phone=x',
                headers: { 'x-forwarded-for': '1.2.3.4' },
            }),
        );
        expect(res.status).toBe(200);
    });
});

describe('DELETE /api/providers/application-session', () => {
    it('returns 400 when id missing', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: { id: 'a1' } }));
        expect(res.status).toBe(200);
    });
});
