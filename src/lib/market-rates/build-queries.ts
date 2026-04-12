import { buildProviderQuery } from '@/app/api/providers/query-builder';
import type { MarketRatesIntent } from './types';

export type MarketRatesQuerySpec = {
    intent: MarketRatesIntent;
    query: string;
};

/**
 * Single Brave query covering typical job / labour / materials context (Western Cape homeowner).
 */
export function buildMarketRatesQuerySpecs(input: {
    trade: string;
    tradeDetail?: string | null;
}): MarketRatesQuerySpec[] {
    const { searchQuery, tradeDetailRaw, baseSearchQuery } = buildProviderQuery({
        trade: input.trade,
        tradeDetail: input.tradeDetail ?? undefined,
    });

    const tradePhrase = searchQuery.trim() || baseSearchQuery.trim() || input.trade.trim();
    const detailBit = tradeDetailRaw.trim() ? ` ${tradeDetailRaw.trim()}` : '';

    const locality = 'South Africa Western Cape homeowner prices';

    return [
        {
            intent: 'typical_labour_band',
            query: `${tradePhrase}${detailBit} typical job cost repair labour materials call out ${locality}`
                .replace(/\s+/g, ' ')
                .slice(0, 240),
        },
    ];
}

/** One broader query if the primary pass returns thin results. */
export function buildMarketRatesFallbackSpecs(input: {
    trade: string;
    tradeDetail?: string | null;
}): MarketRatesQuerySpec[] {
    const { searchQuery, tradeDetailRaw, baseSearchQuery } = buildProviderQuery({
        trade: input.trade,
        tradeDetail: input.tradeDetail ?? undefined,
    });
    const tradePhrase = searchQuery.trim() || baseSearchQuery.trim() || input.trade.trim();
    const detailBit = tradeDetailRaw.trim() ? ` ${tradeDetailRaw.trim()}` : '';
    return [
        {
            intent: 'fallback_broad',
            query: `${tradePhrase}${detailBit} repair cost price South Africa homeowner`.replace(/\s+/g, ' ').slice(0, 220),
        },
    ];
}

export function buildMarketRatesCacheKey(input: {
    regionKey: string;
    tradeNorm: string;
    detailKey: string;
    queryVersion: number;
}): string {
    const r = input.regionKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 16);
    const t = input.tradeNorm.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48);
    const d = input.detailKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48);
    return `mr_v${input.queryVersion}_${r}_${t}_${d}`;
}
