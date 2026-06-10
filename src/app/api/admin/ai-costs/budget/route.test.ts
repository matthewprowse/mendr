import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let denyAdmin = false;

vi.mock('@/lib/auth/admin-auth', () => ({
    requireAdmin: vi.fn(async () => {
        if (denyAdmin) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return null;
    }),
}));

vi.mock('@/lib/auth/supabase-server', () => ({ createSupabaseAdminClient: vi.fn(async () => supabase) }));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: { admin_settings: { data: { value: 500 }, error: null } },
    });
});

describe('GET /api/admin/ai-costs/budget', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs/budget' }));
        expect(res.status).toBe(401);
    });

    it('returns the stored budget value', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs/budget' }));
        expect(res.status).toBe(200);
        expect((await res.json()).monthlyBudgetUsd).toBe(500);
    });
});

describe('POST /api/admin/ai-costs/budget', () => {
    it('accepts a non-negative number', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { amount: 250 } }));
        expect(res.status).toBe(200);
        expect((await res.json()).monthlyBudgetUsd).toBe(250);
    });

    it('accepts null to clear the budget', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { amount: null } }));
        expect(res.status).toBe(200);
        expect((await res.json()).monthlyBudgetUsd).toBeNull();
    });

    it('rejects a non-numeric amount', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { amount: 'lots' } }));
        expect(res.status).toBe(400);
    });
});
