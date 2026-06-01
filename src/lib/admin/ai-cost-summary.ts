/**
 * Pure aggregation for the admin AI Cost tab (Phase 5).
 *
 * Takes raw `ai_cost_events` rows spanning at least the current and previous
 * month and produces month-to-date totals, last-month totals, per-model and
 * per-endpoint breakdowns, cost/calls per diagnosis, and a run-rate projection
 * for the current month. Pure and deterministic so it is unit-testable; the
 * route supplies the rows and "now".
 */

export type AiCostEvent = {
    created_at: string;
    estimated_usd: number;
    total_tokens: number;
    model_name: string | null;
    endpoint: string | null;
    conversation_id: string | null;
};

export type CostTotals = { usd: number; calls: number; tokens: number };

export type AiCostSummary = {
    monthToDate: CostTotals;
    lastMonth: CostTotals;
    byModel: Array<{ model: string; usd: number; calls: number }>;
    byEndpoint: Array<{ endpoint: string; usd: number; calls: number }>;
    costPerDiagnosis: number | null;
    callsPerDiagnosis: number | null;
    projection: {
        elapsedDays: number;
        daysInMonth: number;
        runRateUsd: number | null;
    };
};

function emptyTotals(): CostTotals {
    return { usd: 0, calls: 0, tokens: 0 };
}

function addTo(totals: CostTotals, e: AiCostEvent): void {
    totals.usd += Number(e.estimated_usd) || 0;
    totals.tokens += Number(e.total_tokens) || 0;
    totals.calls += 1;
}

export function summarizeAiCosts(events: AiCostEvent[], now: Date): AiCostSummary {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const monthStart = Date.UTC(y, m, 1);
    const lastMonthStart = Date.UTC(y, m - 1, 1);

    const monthToDate = emptyTotals();
    const lastMonth = emptyTotals();
    const byModel = new Map<string, { usd: number; calls: number }>();
    const byEndpoint = new Map<string, { usd: number; calls: number }>();

    // Cost per diagnosis is computed over MTD events that belong to a conversation.
    const convUsd = new Map<string, number>();
    let convCalls = 0;

    for (const e of events) {
        const t = new Date(e.created_at).getTime();
        if (Number.isNaN(t)) continue;
        if (t >= monthStart) {
            addTo(monthToDate, e);

            const model = e.model_name?.trim() || 'unknown';
            const mAgg = byModel.get(model) ?? { usd: 0, calls: 0 };
            mAgg.usd += Number(e.estimated_usd) || 0;
            mAgg.calls += 1;
            byModel.set(model, mAgg);

            const endpoint = e.endpoint?.trim() || 'unknown';
            const eAgg = byEndpoint.get(endpoint) ?? { usd: 0, calls: 0 };
            eAgg.usd += Number(e.estimated_usd) || 0;
            eAgg.calls += 1;
            byEndpoint.set(endpoint, eAgg);

            if (e.conversation_id) {
                convUsd.set(e.conversation_id, (convUsd.get(e.conversation_id) ?? 0) + (Number(e.estimated_usd) || 0));
                convCalls += 1;
            }
        } else if (t >= lastMonthStart) {
            addTo(lastMonth, e);
        }
    }

    const distinctConvs = convUsd.size;
    const convTotalUsd = Array.from(convUsd.values()).reduce((a, b) => a + b, 0);

    const elapsedDays = now.getUTCDate();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const runRateUsd = elapsedDays > 0 ? (monthToDate.usd / elapsedDays) * daysInMonth : null;

    return {
        monthToDate,
        lastMonth,
        byModel: Array.from(byModel.entries())
            .map(([model, v]) => ({ model, usd: v.usd, calls: v.calls }))
            .sort((a, b) => b.usd - a.usd),
        byEndpoint: Array.from(byEndpoint.entries())
            .map(([endpoint, v]) => ({ endpoint, usd: v.usd, calls: v.calls }))
            .sort((a, b) => b.usd - a.usd),
        costPerDiagnosis: distinctConvs > 0 ? convTotalUsd / distinctConvs : null,
        callsPerDiagnosis: distinctConvs > 0 ? convCalls / distinctConvs : null,
        projection: { elapsedDays, daysInMonth, runRateUsd },
    };
}
