/**
 * Builds a Brave Search query for a single home-maintenance part and executes it.
 * Reuses the existing runBraveWebSearch infrastructure.
 */

import { runBraveWebSearch } from '@/lib/market-rates/brave-web-search';
import type { MarketRateSource } from '@/lib/market-rates/types';

/** Build a focused retail/installed-price query for a single part. */
function buildPartQuery(partName: string, trade: string, regionKey: string): string {
    const region = regionKey.replace(/_/g, ' ');
    // Call-out fees need a trade-specific query rather than a part name search.
    const isCallout = /call.?out|visit fee|trip fee/i.test(partName);
    if (isCallout) {
        return `${trade} call-out fee price South Africa ${region} ZAR`;
    }
    // Labour lines: query by trade context.
    const isLabour = /labour|labor/i.test(partName);
    if (isLabour) {
        return `${trade} labour cost per hour South Africa ${region} ZAR`;
    }
    // Generic part: strip action verbs to get the core component name.
    const core = partName
        .replace(/\b(replacement|repair|installation|inspect(ion)?|swap|service|supply)\b/gi, '')
        .replace(/\(.*?\)/g, '')
        .trim();
    return `${core} price South Africa ${region} ZAR home maintenance`;
}

export interface PartSearchResult {
    sources: MarketRateSource[];
    searchConfigured: boolean;
}

export async function searchPartPrice(
    partName: string,
    trade: string,
    regionKey: string,
): Promise<PartSearchResult> {
    const query = buildPartQuery(partName, trade, regionKey);
    const result = await runBraveWebSearch(query, 'parts_retail');

    return {
        sources: result.sources,
        searchConfigured: result.httpStatus !== 0 || result.errorMessage !== 'missing_brave_search_api_key',
    };
}
