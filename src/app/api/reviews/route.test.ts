import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

const validBody = {
    providerId: VALID_UUID,
    reviewerName: 'Ada',
    reviewTitle: 'Great work',
    reviewBody: 'They fixed the leak quickly.',
    categoryRatings: { punctuality: 5, cleanliness: 4.5, work_quality: 5, quote_accuracy: 4 },
};

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({ tables: { reviews: { data: null, error: null } } });
});

describe('POST /api/reviews', () => {
    it('returns 400 on invalid provider UUID', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, providerId: 'not-a-uuid' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when reviewerName missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, reviewerName: '' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when reviewBody missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, reviewBody: '' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 on out-of-range category rating', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { ...validBody, categoryRatings: { ...validBody.categoryRatings, punctuality: 6 } },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 on non-half-star rating', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { ...validBody, categoryRatings: { ...validBody.categoryRatings, work_quality: 3.3 } },
            }),
        );
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it('returns 500 when DB insert fails', async () => {
        supabase = mockSupabaseClient({
            tables: { reviews: { data: null, error: { message: 'db' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(500);
    });
});
