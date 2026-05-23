import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
const VALID_UUID = '11111111-2222-3333-4444-555555555555';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            diagnoses: {
                data: { id: VALID_UUID, image_urls: ['https://a/1.jpg'] },
                error: null,
            },
        },
    });
});

describe('GET /api/diagnoses/[id]', () => {
    it('returns 400 on invalid id', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/diagnoses/bad' }), ctx('bad'));
        expect(res.status).toBe(400);
    });

    it('returns data on success', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: `/api/diagnoses/${VALID_UUID}` }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.id).toBe(VALID_UUID);
        expect(Array.isArray(body.data.imageUrls)).toBe(true);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: `/api/diagnoses/${VALID_UUID}` }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(500);
    });
});

describe('PATCH /api/diagnoses/[id]', () => {
    it('returns 400 on invalid id', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { title: 'x' } }), ctx('bad'));
        expect(res.status).toBe(400);
    });

    it('returns 400 on malformed JSON', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: undefined, rawBody: 'nope' }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when no valid fields supplied', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: {} }), ctx(VALID_UUID));
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        // The route does UPDATE.select; configure data array to indicate row updated.
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: [{ id: VALID_UUID }], error: null } },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { title: 'Updated' } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(200);
    });
});
