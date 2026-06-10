/**
 * Pure aggregation for the durable diagnosis funnel (Phase 4).
 *
 * Replaces the old session-based `diagnosis_events` funnel. The funnel is now
 * per-diagnosis and computed from durable server-written state:
 *
 *   Started            → a diagnoses row exists (created_at)
 *   Diagnosis delivered → diagnosis_funnel.delivered_at is set
 *   Matches shown       → diagnosis_funnel.matches_shown_at is set
 *   Contacted           → diagnosis_funnel.first_contact_at is set
 *
 * Each stage counts the diagnoses in the cohort that reached it. Conversions are
 * relative to the prior stage. The aggregation is pure and deterministic so it
 * is trivially unit-testable; the route supplies already-joined rows.
 */

export type DurableFunnelRow = {
    created_at: string;
    trade: string | null;
    delivered_at: string | null;
    matches_shown_at: string | null;
    first_contact_at: string | null;
};

export type StageKey = 'started' | 'delivered' | 'matches_shown' | 'contacted';

export type DurableFunnelStage = {
    key: StageKey;
    label: string;
    count: number;
    conversionFromPrior: number | null;
};

export type TradeBreakdownRow = {
    trade: string;
    started: number;
    contacted: number;
    conversion: number | null;
};

export type DurableFunnelResult = {
    stages: DurableFunnelStage[];
    totalDiagnoses: number;
    overallConversion: number | null;
    medianMinutesToContact: number | null;
    tradeBreakdown: TradeBreakdownRow[];
};

const STAGE_DEFS: ReadonlyArray<{ key: StageKey; label: string }> = [
    { key: 'started', label: 'Started' },
    { key: 'delivered', label: 'Diagnosis delivered' },
    { key: 'matches_shown', label: 'Matches shown' },
    { key: 'contacted', label: 'Contacted' },
] as const;

function pct(num: number, denom: number): number | null {
    return denom > 0 ? (num / denom) * 100 : null;
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeDurableFunnel(rows: DurableFunnelRow[]): DurableFunnelResult {
    const counts: Record<StageKey, number> = {
        started: rows.length,
        delivered: rows.filter((r) => r.delivered_at != null).length,
        matches_shown: rows.filter((r) => r.matches_shown_at != null).length,
        contacted: rows.filter((r) => r.first_contact_at != null).length,
    };

    const stages: DurableFunnelStage[] = STAGE_DEFS.map((def, i) => ({
        key: def.key,
        label: def.label,
        count: counts[def.key],
        conversionFromPrior: i === 0 ? null : pct(counts[def.key], counts[STAGE_DEFS[i - 1].key]),
    }));

    // Median minutes from diagnosis creation to first contact.
    const diffs: number[] = [];
    for (const r of rows) {
        if (!r.first_contact_at || !r.created_at) continue;
        const ms = new Date(r.first_contact_at).getTime() - new Date(r.created_at).getTime();
        if (Number.isFinite(ms) && ms >= 0) diffs.push(ms / 60000);
    }

    // Per-trade started/contacted with conversion.
    const byTrade = new Map<string, { started: number; contacted: number }>();
    for (const r of rows) {
        const trade = r.trade && r.trade.trim() ? r.trade.trim() : 'Unknown';
        const bucket = byTrade.get(trade) ?? { started: 0, contacted: 0 };
        bucket.started += 1;
        if (r.first_contact_at != null) bucket.contacted += 1;
        byTrade.set(trade, bucket);
    }
    const tradeBreakdown: TradeBreakdownRow[] = Array.from(byTrade.entries())
        .map(([trade, b]) => ({
            trade,
            started: b.started,
            contacted: b.contacted,
            conversion: pct(b.contacted, b.started),
        }))
        .sort((a, b) => b.started - a.started);

    return {
        stages,
        totalDiagnoses: counts.started,
        overallConversion: pct(counts.contacted, counts.started),
        medianMinutesToContact: median(diffs),
        tradeBreakdown,
    };
}
