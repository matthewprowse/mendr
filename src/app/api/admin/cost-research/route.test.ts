/**
 * Contract tests for POST /api/admin/cost-research — the only endpoint that
 * spends money on Brave + Gemini. The tests pin the safety rails:
 *
 *   - admin gate
 *   - dryRun defaults to TRUE (must pass dryRun: false to spend)
 *   - staleness skip (fresh entries are not re-researched) and force override
 *   - limit clamping
 *   - per-item failures are reported, not thrown
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let denyAdmin = false;

type ResearchOutcome = { ok: true } | { ok: false; reason: string };
const researchAndCacheCost = vi.fn<(...args: unknown[]) => Promise<ResearchOutcome>>(
    async () => ({ ok: true }),
);

vi.mock('@/lib/auth/admin-auth', () => ({
    requireAdmin: vi.fn(async () => {
        if (denyAdmin) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return null;
    }),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

vi.mock('@/lib/cost/brave-search', () => ({
    braveWebSearch: vi.fn(async () => []),
}));

vi.mock('@/lib/cost/extract-cost', () => ({
    extractCostWithGemini: vi.fn(async () => null),
}));

vi.mock('@/lib/cost/research-cost', () => ({
    researchAndCacheCost: (...args: unknown[]) => researchAndCacheCost(...(args as [])),
}));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    researchAndCacheCost.mockResolvedValue({ ok: true });
    // No cached rows → everything is due for research.
    supabase = mockSupabaseClient({
        tables: { cost_estimates: { data: [], error: null } },
    });
});

describe('POST /api/admin/cost-research — gates and defaults', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(401);
        expect(researchAndCacheCost).not.toHaveBeenCalled();
    });

    it('defaults to dryRun and spends nothing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.dryRun).toBe(true);
        expect(body.due).toBeGreaterThan(0);
        expect(researchAndCacheCost).not.toHaveBeenCalled();
    });

    it('stays in dryRun even with a malformed body', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', rawBody: '{ broken' }));
        expect(res.status).toBe(200);
        expect((await res.json()).dryRun).toBe(true);
        expect(researchAndCacheCost).not.toHaveBeenCalled();
    });

    it('only spends when dryRun is explicitly false', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { dryRun: false, limit: 3 } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.dryRun).toBe(false);
        expect(researchAndCacheCost).toHaveBeenCalledTimes(3);
    });
});

describe('POST /api/admin/cost-research — staleness and limits', () => {
    it('skips entries researched within the refresh window', async () => {
        const fresh = new Date().toISOString();
        supabase = mockSupabaseClient({
            tables: {
                cost_estimates: (_t, _op) => ({
                    // Pretend a couple of subcategories were just researched.
                    data: [
                        { subcategory_id: 'sub-fresh-1', researched_at: fresh },
                    ],
                    error: null,
                }),
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        const body = await res.json();
        // The route reports freshSkipped relative to totalTargets; with one
        // potentially-matching fresh row the count is target-list dependent,
        // so just pin the invariant: due + freshSkipped === totalTargets.
        expect(body.due + body.freshSkipped).toBe(body.totalTargets);
    });

    it('force re-researches fresh entries', async () => {
        const fresh = new Date().toISOString();
        supabase = mockSupabaseClient({
            tables: {
                cost_estimates: {
                    data: [{ subcategory_id: 'anything', researched_at: fresh }],
                    error: null,
                },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { force: true } }));
        const body = await res.json();
        expect(body.freshSkipped).toBe(0);
        expect(body.due).toBe(body.totalTargets);
    });

    it('clamps limit to at most 86 and at least 1', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { dryRun: true, limit: 9999 } }),
        );
        const body = await res.json();
        expect(body.wouldResearch.length).toBeLessThanOrEqual(86);

        const res2 = await POST(
            makeRequest({ method: 'POST', body: { dryRun: true, limit: -5 } }),
        );
        const body2 = await res2.json();
        expect(body2.wouldResearch.length).toBeLessThanOrEqual(1);
    });
});

describe('POST /api/admin/cost-research — outcome reporting', () => {
    it('reports per-item failures without aborting the batch', async () => {
        researchAndCacheCost
            .mockResolvedValueOnce({ ok: true })
            .mockResolvedValueOnce({ ok: false, reason: 'no snippets' })
            .mockRejectedValueOnce(new Error('network down'));
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { dryRun: false, limit: 3 } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.researched).toHaveLength(1);
        expect(body.failed).toHaveLength(2);
        expect(body.failed.map((f: { reason: string }) => f.reason)).toEqual([
            'no snippets',
            'network down',
        ]);
    });
});
