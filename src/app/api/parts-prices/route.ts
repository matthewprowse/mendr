/**
 * POST /api/parts-prices
 *
 * Resolves retail/installed ZAR prices for an array of expected_parts strings
 * using Brave Search + Gemini extraction, with a 28-day Supabase cache.
 *
 * Request body:
 *   { parts: string[], trade: string, trade_detail?: string, region_key?: string }
 *
 * Response:
 *   { results: PartPrice[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';

import { lookupPartPrices } from '@/lib/parts-prices/lookup';
import type { PartsPricesRequest, PartsPricesResponse } from '@/lib/parts-prices/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEFAULT_REGION = 'cape_town';
const MAX_PARTS = 8;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'partsPrices');
    if (limited) return limited;

    let body: Partial<PartsPricesRequest>;
    try {
        body = (await req.json()) as Partial<PartsPricesRequest>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawParts = Array.isArray(body.parts) ? body.parts : [];
    const parts = rawParts
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .slice(0, MAX_PARTS);

    const trade = typeof body.trade === 'string' && body.trade.trim() ? body.trade.trim() : 'General Handyman';
    const tradeDetail = typeof body.trade_detail === 'string' ? body.trade_detail.trim() : '';
    const regionKey = typeof body.region_key === 'string' && body.region_key.trim()
        ? body.region_key.trim()
        : DEFAULT_REGION;
    if (parts.length === 0) {
        return NextResponse.json<PartsPricesResponse>({ results: [] });
    }

    try {
        const results = await lookupPartPrices(parts, trade, tradeDetail, regionKey);
        return NextResponse.json<PartsPricesResponse>({ results });
    } catch (err) {
        console.error('[parts-prices] lookup error:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
