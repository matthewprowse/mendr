/**
 * Cost research orchestration: query Brave, extract a {min, max, note} via an
 * LLM, and write it to the cost_estimates cache. The search/extract/db
 * dependencies are injected so this is fully unit-testable with no real API
 * calls. The real Brave + Gemini adapters are wired in only by the deliberate
 * admin/cron trigger — never on a page view.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import type { BraveResult } from './brave-search';

export type CostResearch = {
    min_zar: number;
    max_zar: number | null;
    unit: string;
    note: string | null;
};

/** Build the search query for a fault type. Pure. */
export function buildCostQuery(faultLabel: string, region = 'South Africa'): string {
    return `${faultLabel} repair cost ${region}`.replace(/\s+/g, ' ').trim();
}

type AdminFactory = typeof createSupabaseAdminClient;

export type ResearchDeps = {
    search: (query: string) => Promise<BraveResult[]>;
    extract: (faultLabel: string, snippets: string[]) => Promise<CostResearch | null>;
    adminClientFactory?: AdminFactory;
    /** Injected timestamp for deterministic tests. */
    now?: string;
};

export type ResearchOutcome =
    | { ok: true; result: CostResearch; query: string }
    | { ok: false; reason: 'no_results' | 'no_extract' | 'write_failed'; query: string };

export async function researchAndCacheCost(
    input: { subcategoryId: string; faultLabel: string; variantKey?: string },
    deps: ResearchDeps,
): Promise<ResearchOutcome> {
    const query = buildCostQuery(input.faultLabel);

    const results = await deps.search(query);
    if (results.length === 0) return { ok: false, reason: 'no_results', query };

    const snippets = results.slice(0, 8).map((r) => `${r.title} — ${r.description}`.trim());
    const extracted = await deps.extract(input.faultLabel, snippets);
    if (!extracted || !Number.isFinite(extracted.min_zar) || extracted.min_zar <= 0) {
        return { ok: false, reason: 'no_extract', query };
    }

    const now = deps.now ?? new Date().toISOString();
    const factory = deps.adminClientFactory ?? createSupabaseAdminClient;
    const admin = await factory();
    const { error } = await admin.from('cost_estimates').upsert(
        {
            subcategory_id: input.subcategoryId,
            variant_key: input.variantKey ?? '',
            min_zar: Math.round(extracted.min_zar),
            max_zar: extracted.max_zar != null ? Math.round(extracted.max_zar) : null,
            unit: extracted.unit || null,
            note: extracted.note,
            source: 'brave',
            research_query: query,
            researched_at: now,
            updated_at: now,
        },
        { onConflict: 'subcategory_id,variant_key' },
    );
    if (error) return { ok: false, reason: 'write_failed', query };

    return { ok: true, result: extracted, query };
}
