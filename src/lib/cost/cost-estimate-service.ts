/**
 * Read path for cost estimates. Serves the researched, cached value from the
 * cost_estimates table when present, and falls back to the static estimates in
 * code until the cache is populated. This NEVER calls Brave; population happens
 * separately in the research pipeline.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import {
    getCostEstimate,
    formatCostEstimate,
    type FormattedCostEstimate,
    type CostEstimate,
} from '@/lib/diagnosis/cost-estimates';

type AdminClientFactory = typeof createSupabaseAdminClient;

type CostRow = {
    min_zar: number | null;
    max_zar: number | null;
    unit: string | null;
    note: string | null;
};

export async function getCostEstimateCached(
    subcategoryId: string | null | undefined,
    deps: { adminClientFactory?: AdminClientFactory } = {},
): Promise<FormattedCostEstimate | null> {
    if (!subcategoryId) return null;

    const factory = deps.adminClientFactory ?? createSupabaseAdminClient;
    try {
        const admin = await factory();
        const { data } = await admin
            .from('cost_estimates')
            .select('min_zar, max_zar, unit, note')
            .eq('subcategory_id', subcategoryId)
            .eq('variant_key', '') // Layer 1 baseline
            .maybeSingle();
        const row = data as CostRow | null;
        if (row && typeof row.min_zar === 'number') {
            const est: CostEstimate = {
                min: row.min_zar,
                max: typeof row.max_zar === 'number' ? row.max_zar : null,
                unit: row.unit ?? '',
                note: row.note ?? undefined,
            };
            return formatCostEstimate(est);
        }
    } catch {
        // Cache read failed; fall through to the static estimate.
    }

    return getCostEstimate(subcategoryId);
}
