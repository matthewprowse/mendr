import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({ tables: { cost_estimates: { data: null, error: null } } });
});

describe('GET /api/cost-estimate', () => {
    it('falls back to the static estimate when no cached row exists', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cost-estimate?subcategoryId=gate_motor_fault' }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.estimate).not.toBeNull();
        expect(typeof body.estimate.label).toBe('string');
    });

    it('returns a null estimate for an unknown subcategory', async () => {
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cost-estimate?subcategoryId=does_not_exist' }),
        );
        const body = await res.json();
        expect(body.estimate).toBeNull();
    });

    it('returns a null estimate when no subcategoryId is supplied', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cost-estimate' }));
        const body = await res.json();
        expect(body.estimate).toBeNull();
    });

    it('serves the cached row when present', async () => {
        supabase = mockSupabaseClient({
            tables: {
                cost_estimates: {
                    data: { min_zar: 1234, max_zar: 5678, unit: 'repair', note: 'cached note' },
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: '/api/cost-estimate?subcategoryId=gate_motor_fault' }),
        );
        const body = await res.json();
        expect(body.estimate.note).toBe('cached note');
        expect(body.estimate.label).toContain('234');
    });
});
