import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

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

vi.mock('@/lib/ai/ai-cost-logger', () => ({
    getAiCostDailyTotals: vi.fn(async (days: number) => [{ day: '2026-05-20', total: 1.23, days }]),
}));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
});

describe('GET /api/admin/ai-costs', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs' }));
        expect(res.status).toBe(401);
    });

    it('returns daily totals (default 7 days)', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        const aiCost = await import('@/lib/ai/ai-cost-logger');
        expect(aiCost.getAiCostDailyTotals).toHaveBeenCalledWith(7);
    });

    it('clamps days to a max of 90', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs?days=9999' }));
        expect(res.status).toBe(200);
        const aiCost = await import('@/lib/ai/ai-cost-logger');
        expect(aiCost.getAiCostDailyTotals).toHaveBeenCalledWith(90);
    });

    it('clamps invalid days to default', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/ai-costs?days=abc' }));
        expect(res.status).toBe(200);
        const aiCost = await import('@/lib/ai/ai-cost-logger');
        expect(aiCost.getAiCostDailyTotals).toHaveBeenCalledWith(7);
    });
});
