/**
 * Phase 5 — features/home/stats.
 *
 * These build the home dashboard's platform + user stats and activity series
 * from Supabase. We mock `createSupabaseAdminClient` so the query chains and
 * the zero-fill / empty-fallback logic are exercised without a real DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const createSupabaseAdminClient = vi.fn(async () => ({ rpc, from }));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: () => createSupabaseAdminClient(),
}));

import { getHomeStats, getRecentDiagnoses, getDiagnosesSeries } from '@/features/home/stats';

/** Build a thenable query chain that resolves to `{ data }`. */
function selectChain(data: unknown) {
    const chain: Record<string, unknown> = {};
    const ret = () => chain;
    chain.select = ret;
    chain.eq = ret;
    chain.order = ret;
    chain.limit = () => Promise.resolve({ data });
    // For getDiagnosesSeries the chain ends at `.eq()` which must be awaitable.
    (chain as { then?: unknown }).then = (resolve: (v: { data: unknown }) => void) =>
        resolve({ data });
    return chain;
}

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    createSupabaseAdminClient.mockClear();
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('getHomeStats', () => {
    it('merges rpc results over the empty defaults', async () => {
        rpc.mockImplementation((name: string) => {
            if (name === 'platform_home_stats') {
                return Promise.resolve({
                    data: { committed_total: 120, first_pass_pct: 78, providers_active: 40 },
                });
            }
            return Promise.resolve({ data: { total: 5, first_pass_correct: 4 } });
        });
        const out = await getHomeStats('user-1');
        expect(out.platform.committed_total).toBe(120);
        expect(out.platform.providers_active).toBe(40);
        // Unset platform fields keep their zero defaults.
        expect(out.platform.avg_confidence).toBe(0);
        expect(out.user.total).toBe(5);
        expect(out.user.by_trade).toEqual([]);
    });

    it('returns zeroed stats when both rpc calls return null data', async () => {
        rpc.mockResolvedValue({ data: null });
        const out = await getHomeStats('user-2');
        expect(out.platform.committed_total).toBe(0);
        expect(out.user.total).toBe(0);
        expect(typeof out.platform.first_pass_pct).toBe('number');
    });
});

describe('getRecentDiagnoses', () => {
    it('returns the rows from the diagnoses query', async () => {
        const rows = [{ id: 'd1', title: 'Leak', diagnosis: null, customer_address: null, created_at: 'x' }];
        from.mockReturnValue(selectChain(rows));
        const out = await getRecentDiagnoses('user-1', 3);
        expect(out).toEqual(rows);
        expect(from).toHaveBeenCalledWith('diagnoses');
    });

    it('returns an empty array when the query yields null', async () => {
        from.mockReturnValue(selectChain(null));
        const out = await getRecentDiagnoses('user-1');
        expect(out).toEqual([]);
    });
});

describe('getDiagnosesSeries', () => {
    it('zero-fills all three time ranges when there is no data', async () => {
        from.mockReturnValue(selectChain([]));
        const out = await getDiagnosesSeries('user-1');
        expect(out.week).toHaveLength(7);
        expect(out.month).toHaveLength(30);
        expect(out.sixMonths).toHaveLength(6);
        expect(out.week.every((p) => p.count === 0)).toBe(true);
    });

    it('buckets a diagnosis dated today into the final week bucket', async () => {
        const today = new Date().toISOString();
        from.mockReturnValue(selectChain([{ created_at: today }, { created_at: today }]));
        const out = await getDiagnosesSeries('user-1');
        const weekTotal = out.week.reduce((acc, p) => acc + p.count, 0);
        expect(weekTotal).toBe(2);
        expect(out.week[out.week.length - 1].count).toBe(2);
    });

    it('ignores rows with an unparseable created_at', async () => {
        from.mockReturnValue(selectChain([{ created_at: 'not-a-date' }]));
        const out = await getDiagnosesSeries('user-1');
        const weekTotal = out.week.reduce((acc, p) => acc + p.count, 0);
        expect(weekTotal).toBe(0);
    });
});
