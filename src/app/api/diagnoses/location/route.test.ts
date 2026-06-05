import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
    type SupabaseQueryResult,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let authUser: { id: string } | null = null;
const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const OWNER = 'owner-user-1';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
    createSupabaseServerClient: vi.fn(async () => mockSupabaseClient({ user: authUser })),
}));

function seq(...results: SupabaseQueryResult[]) {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

beforeEach(() => {
    vi.clearAllMocks();
    authUser = null;
    supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
});

describe('POST /api/diagnoses/location', () => {
    it('returns 400 when id invalid', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { id: 'bad', customer_lat: -33, customer_lng: 18 } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when coordinates missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { id: VALID_UUID } }));
        expect(res.status).toBe(400);
    });

    it('writes the location for the owner', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({
            tables: {
                diagnoses: seq(
                    { data: { user_id: OWNER, anon_key: null }, error: null }, // ownership SELECT
                    { data: null, error: null }, // UPDATE
                ),
            },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { id: VALID_UUID, customer_lat: -33.9, customer_lng: 18.4 } }),
        );
        expect(res.status).toBe(200);
    });

    it('returns 404 when the row is owned by someone else (IDOR)', async () => {
        authUser = { id: 'intruder' };
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: { user_id: OWNER, anon_key: null }, error: null } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { id: VALID_UUID, customer_lat: -33.9, customer_lng: 18.4 } }),
        );
        expect(res.status).toBe(404);
    });

    it('returns 404 when the row does not exist', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { id: VALID_UUID, customer_lat: -33.9, customer_lng: 18.4 } }),
        );
        expect(res.status).toBe(404);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: { message: 'db' } } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { id: VALID_UUID, customer_lat: -33.9, customer_lng: 18.4 } }),
        );
        expect(res.status).toBe(500);
    });
});
