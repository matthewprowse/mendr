import { describe, it, expect } from 'vitest';
import { getCostEstimateCached } from '@/lib/cost/cost-estimate-service';
import { getCostEstimate, formatCostEstimate } from '@/lib/diagnosis/cost-estimates';
import { mockSupabaseClient } from '@/__tests__/helpers/route-test';

type Factory = NonNullable<Parameters<typeof getCostEstimateCached>[1]>['adminClientFactory'];

// Wrap the shared Supabase mock as an admin-client factory.
function factoryWith(row: unknown): Factory {
    return (async () =>
        mockSupabaseClient({
            tables: { cost_estimates: { data: row, error: null } },
        })) as unknown as Factory;
}

describe('getCostEstimateCached', () => {
    it('returns null for a missing subcategory id', async () => {
        expect(await getCostEstimateCached(null)).toBeNull();
        expect(await getCostEstimateCached(undefined)).toBeNull();
    });

    it('uses the cached DB row when present', async () => {
        const row = { min_zar: 800, max_zar: 2500, unit: 'repair', note: 'Replacement R5,000' };
        const out = await getCostEstimateCached('anything', {
            adminClientFactory: factoryWith(row),
        });
        expect(out).toEqual(
            formatCostEstimate({
                min: 800,
                max: 2500,
                unit: 'repair',
                note: 'Replacement R5,000',
            }),
        );
    });

    it('falls back to the static estimate when there is no cached row', async () => {
        const out = await getCostEstimateCached('gate_motor_fault', {
            adminClientFactory: factoryWith(null),
        });
        expect(out).toEqual(getCostEstimate('gate_motor_fault'));
        expect(out).not.toBeNull();
    });

    it('falls back to static when the cached row has no usable minimum', async () => {
        const out = await getCostEstimateCached('gate_motor_fault', {
            adminClientFactory: factoryWith({
                min_zar: null,
                max_zar: null,
                unit: null,
                note: null,
            }),
        });
        expect(out).toEqual(getCostEstimate('gate_motor_fault'));
    });

    it('falls back to static when the cache read throws', async () => {
        const throwingFactory = (async () => {
            throw new Error('db down');
        }) as unknown as Factory;
        const out = await getCostEstimateCached('gate_motor_fault', {
            adminClientFactory: throwingFactory,
        });
        expect(out).toEqual(getCostEstimate('gate_motor_fault'));
    });
});
