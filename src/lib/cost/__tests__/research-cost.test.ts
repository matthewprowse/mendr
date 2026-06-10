import { describe, it, expect, vi } from 'vitest';
import {
    buildCostQuery,
    researchAndCacheCost,
    type CostResearch,
    type ResearchDeps,
} from '@/lib/cost/research-cost';
import type { BraveResult } from '@/lib/cost/brave-search';

const RESULTS: BraveResult[] = [
    { title: 'Geyser repair', url: 'https://a.co', description: 'Typically R800 to R2500' },
];

// Hand-rolled admin client that records the upsert payload and returns a
// configurable result, so we can assert what gets written without the real DB.
function fakeAdmin(result: { error: { message: string } | null } = { error: null }) {
    const calls: Array<{ row: Record<string, unknown>; opts: unknown }> = [];
    const client = {
        from: () => ({
            upsert: (row: Record<string, unknown>, opts: unknown) => {
                calls.push({ row, opts });
                return Promise.resolve(result);
            },
        }),
    };
    return {
        factory: (async () => client) as unknown as ResearchDeps['adminClientFactory'],
        calls,
    };
}

describe('buildCostQuery', () => {
    it('builds a tidy query and collapses whitespace', () => {
        expect(buildCostQuery('Geyser leak')).toBe('Geyser leak repair cost South Africa');
        expect(buildCostQuery('  Gate   motor  ')).toBe('Gate motor repair cost South Africa');
    });
});

describe('researchAndCacheCost', () => {
    const extracted: CostResearch = {
        min_zar: 800.4,
        max_zar: 2500.6,
        unit: 'repair',
        note: 'n',
    };

    it('searches, extracts, and upserts the rounded values at the baseline key', async () => {
        const admin = fakeAdmin();
        const deps: ResearchDeps = {
            search: vi.fn(async () => RESULTS),
            extract: vi.fn(async () => extracted),
            adminClientFactory: admin.factory,
            now: '2026-06-05T00:00:00.000Z',
        };
        const out = await researchAndCacheCost(
            { subcategoryId: 'geyser_fault_plumbing', faultLabel: 'Geyser leak' },
            deps,
        );

        expect(out.ok).toBe(true);
        expect(deps.search).toHaveBeenCalledWith('Geyser leak repair cost South Africa');
        expect(admin.calls).toHaveLength(1);
        expect(admin.calls[0].row).toMatchObject({
            subcategory_id: 'geyser_fault_plumbing',
            variant_key: '',
            min_zar: 800, // rounded
            max_zar: 2501, // rounded
            unit: 'repair',
            source: 'brave',
            researched_at: '2026-06-05T00:00:00.000Z',
        });
        expect(admin.calls[0].opts).toEqual({ onConflict: 'subcategory_id,variant_key' });
    });

    it('returns no_results and does not call extract when search is empty', async () => {
        const extract = vi.fn(async () => extracted);
        const out = await researchAndCacheCost(
            { subcategoryId: 's', faultLabel: 'x' },
            { search: vi.fn(async () => []), extract, adminClientFactory: fakeAdmin().factory },
        );
        expect(out).toMatchObject({ ok: false, reason: 'no_results' });
        expect(extract).not.toHaveBeenCalled();
    });

    it('returns no_extract for null, non-finite, or non-positive minimums', async () => {
        const base = {
            search: vi.fn(async () => RESULTS),
            adminClientFactory: fakeAdmin().factory,
        };
        for (const bad of [
            null,
            { min_zar: NaN, max_zar: null, unit: '', note: null },
            { min_zar: 0, max_zar: null, unit: '', note: null },
        ]) {
            const out = await researchAndCacheCost(
                { subcategoryId: 's', faultLabel: 'x' },
                { ...base, extract: vi.fn(async () => bad as CostResearch | null) },
            );
            expect(out).toMatchObject({ ok: false, reason: 'no_extract' });
        }
    });

    it('returns write_failed when the upsert errors', async () => {
        const admin = fakeAdmin({ error: { message: 'db down' } });
        const out = await researchAndCacheCost(
            { subcategoryId: 's', faultLabel: 'x' },
            {
                search: vi.fn(async () => RESULTS),
                extract: vi.fn(async () => extracted),
                adminClientFactory: admin.factory,
            },
        );
        expect(out).toMatchObject({ ok: false, reason: 'write_failed' });
    });
});
