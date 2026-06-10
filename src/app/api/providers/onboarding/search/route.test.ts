import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));

// The route now searches our `providers` table via the admin client (no Google).
let queryResult: { data: unknown; error: unknown } = { data: [], error: null };
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: () => {
            // A thenable query builder where every method returns itself and
            // awaiting resolves to the configured { data, error }.
             
            const builder: any = {
                select: () => builder,
                ilike: () => builder,
                eq: () => builder,
                order: () => builder,
                limit: () => builder,
                then: (resolve: (v: unknown) => unknown) => resolve(queryResult),
            };
            return builder;
        },
    })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    queryResult = { data: [], error: null };
});

describe('POST /api/providers/onboarding/search', () => {
    it('returns 400 on invalid JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when query too short', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { query: 'a' } }));
        expect(res.status).toBe(400);
    });

    it('returns providers matched from our database', async () => {
        queryResult = {
            data: [
                {
                    id: 'prov-1',
                    google_place_id: 'gp1',
                    name: 'Acme Plumbing',
                    address: '1 Main Rd, Cape Town',
                    phone: '+27821234567',
                    website: 'https://acme.co.za',
                    latitude: -33.9,
                    longitude: 18.4,
                    rating: 4.5,
                    rating_count: 10,
                },
            ],
            error: null,
        };
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { query: 'plumb' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0].name).toBe('Acme Plumbing');
        expect(body.results[0].placeId).toBe('gp1');
    });

    it('returns 500 when the DB query errors', async () => {
        queryResult = { data: null, error: { message: 'db' } };
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { query: 'plumb' } }));
        expect(res.status).toBe(500);
    });
});
