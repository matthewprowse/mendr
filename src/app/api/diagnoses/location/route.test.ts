import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
const VALID_UUID = '11111111-2222-3333-4444-555555555555';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
});

describe('POST /api/diagnoses/location', () => {
    it('returns 400 when id invalid', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { id: 'bad', customer_lat: -33, customer_lng: 18 },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when coordinates missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { id: VALID_UUID } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { id: VALID_UUID, customer_lat: -33.9, customer_lng: 18.4 },
            }),
        );
        expect(res.status).toBe(200);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: { message: 'db' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { id: VALID_UUID, customer_lat: -33.9, customer_lng: 18.4 },
            }),
        );
        expect(res.status).toBe(500);
    });
});
