/**
 * POST /api/admin/cost-research — deliberate, admin-only cost research trigger.
 *
 * This is the ONLY place that spends money on Brave + Gemini. Safeguards:
 *   - admin gated
 *   - dryRun defaults to TRUE; you must pass { dryRun: false } to actually run
 *   - a staleness skip (REFRESH_DAYS) so fresh entries are not re-researched
 *   - a `limit` caps how many fault types are processed per call
 *
 * Body: { subcategoryIds?: string[], dryRun?: boolean, force?: boolean, limit?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import {
    TAXONOMY_SUBCATEGORIES,
    TAXONOMY_NONE_ID,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';
import { braveWebSearch } from '@/lib/cost/brave-search';
import { extractCostWithGemini } from '@/lib/cost/extract-cost';
import { researchAndCacheCost } from '@/lib/cost/research-cost';

const REFRESH_DAYS = 45;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = (await req.json().catch(() => ({}))) as {
        subcategoryIds?: unknown;
        dryRun?: unknown;
        force?: unknown;
        limit?: unknown;
    };
    const dryRun = body.dryRun !== false; // safe default: dry run unless explicitly false
    const force = body.force === true;
    const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 25), 1), 86);
    const onlyIds = Array.isArray(body.subcategoryIds)
        ? new Set(body.subcategoryIds.filter((x): x is string => typeof x === 'string'))
        : null;

    const targets = TAXONOMY_SUBCATEGORIES.filter(
        (s) => s.id !== TAXONOMY_NONE_ID && (!onlyIds || onlyIds.has(s.id)),
    );

    const admin = await createSupabaseAdminClient();
    const { data: existing } = await admin
        .from('cost_estimates')
        .select('subcategory_id, researched_at')
        .eq('variant_key', '');
    const researchedAt = new Map<string, string | null>();
    for (const r of (existing ?? []) as {
        subcategory_id: string;
        researched_at: string | null;
    }[]) {
        researchedAt.set(r.subcategory_id, r.researched_at);
    }
    const cutoff = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();

    const due = targets.filter((s) => {
        if (force) return true;
        const ra = researchedAt.get(s.id);
        return !ra || ra < cutoff;
    });

    if (dryRun) {
        return NextResponse.json({
            dryRun: true,
            totalTargets: targets.length,
            due: due.length,
            freshSkipped: targets.length - due.length,
            wouldResearch: due.slice(0, limit).map((s) => s.id),
        });
    }

    const batch = due.slice(0, limit);
    const researched: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const s of batch) {
        try {
            const outcome = await researchAndCacheCost(
                { subcategoryId: s.id, faultLabel: s.label },
                {
                    search: (q) => braveWebSearch(q),
                    extract: (label, snippets) => extractCostWithGemini(label, snippets),
                },
            );
            if (outcome.ok) researched.push(s.id);
            else failed.push({ id: s.id, reason: outcome.reason });
        } catch (e) {
            failed.push({ id: s.id, reason: e instanceof Error ? e.message : 'error' });
        }
    }

    return NextResponse.json({
        dryRun: false,
        totalTargets: targets.length,
        processed: batch.length,
        researched,
        failed,
        freshSkipped: targets.length - due.length,
    });
}
