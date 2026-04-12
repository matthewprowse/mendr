import type { DiagnosisData } from '@/app/chat/components/types';
import type { MarketRateSource } from '@/lib/market-rates/types';

type MarketRatesResearchJson = {
    ok?: boolean;
    refined_costs?: {
        estimated_cost?: string;
    };
    /** Same entries as `market_rates.sources`; kept for older responses. */
    sources?: MarketRateSource[];
    market_rates?: DiagnosisData['market_rates'];
};

/** Merge POST /api/market-rates/research JSON into local diagnosis state (server may have persisted already). */
export function mergeMarketRatesResponseIntoDiagnosis(
    prev: DiagnosisData | null,
    json: MarketRatesResearchJson
): DiagnosisData | null {
    if (!prev || !json.ok) return prev;
    const next: DiagnosisData = { ...prev };
    const r = json.refined_costs;
    if (r && typeof r.estimated_cost === 'string' && r.estimated_cost.trim()) {
        next.estimated_cost = r.estimated_cost.trim();
        delete next.repair_cost_range;
        delete next.replacement_cost_range;
        delete next.equipment_parts_range;
    }
    if (json.market_rates) {
        next.market_rates = json.market_rates;
    }
    const topSources = json.sources;
    if (Array.isArray(topSources) && topSources.length > 0) {
        const mr = next.market_rates ?? {};
        const existing = mr.sources;
        if (!Array.isArray(existing) || existing.length === 0) {
            next.market_rates = { ...mr, sources: topSources };
        }
    }
    return next;
}
