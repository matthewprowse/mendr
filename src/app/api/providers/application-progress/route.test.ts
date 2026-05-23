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
        tables: { provider_applications: { data: [{ id: 'a1' }], error: null } },
    });
});

describe('GET /api/providers/application-progress', () => {
    it('returns null application when no phone or ip', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/application-progress' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.application).toBeNull();
    });

    it('returns matching application when phone is supplied', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/providers/application-progress?phone=%2B27821234567' }),
        );
        expect(res.status).toBe(200);
    });

    it('returns 500 when DB errors', async () => {
        supabase = mockSupabaseClient({
            tables: { provider_applications: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({
                path: '/api/providers/application-progress?phone=%2B27821234567',
                headers: { 'x-forwarded-for': '1.2.3.4' },
            }),
        );
        expect(res.status).toBe(500);
    });
});

describe('DELETE /api/providers/application-progress', () => {
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
