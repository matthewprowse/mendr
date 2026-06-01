/**
 * Single source of truth for resolving any free-text trade or fault string to a
 * canonical trade label. Previously this logic was duplicated and drifting
 * across `canonicalTradeLabel` (agent-classify) and `inferTradeFromProseFallback`
 * (response-builder), each combining the two keyword sources differently.
 *
 * Precedence:
 *   1. tradeToServiceLabel — exact canonical-label match, then the trade-noun and
 *      hardware synonym map in `services.ts` (e.g. "plumber", "torsion spring").
 *   2. inferTradeFromSignals — the taxonomy `inferenceAnchors`, i.e. fault-
 *      description keywords (e.g. "burst pipe", "gate motor"), which also yield a
 *      subcategory. We take only its trade here.
 *
 * Returns a canonical trade label or null. Use this everywhere a trade string or
 * fault description needs to become a canonical trade; for subcategory routing
 * use the taxonomy directly.
 */

import { tradeToServiceLabel } from '@/lib/services';
import {
    inferTradeFromSignals,
    type CanonicalTradeLabel,
} from '@/lib/diagnosis/diagnosis-trade-taxonomy';

export function resolveCanonicalTrade(text: string | null | undefined): CanonicalTradeLabel | null {
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t || t.toLowerCase() === 'n/a') return null;

    const viaLabel = tradeToServiceLabel(t);
    if (viaLabel) return viaLabel as CanonicalTradeLabel;

    const viaAnchor = inferTradeFromSignals(t);
    if (viaAnchor) return viaAnchor.trade;

    return null;
}
