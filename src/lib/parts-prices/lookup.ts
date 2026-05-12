/**
 * Main parts-price lookup with 28-day Supabase cache.
 *
 * For each part:
 *   1. Build a deterministic cache_key from (part_name, variant, region_key, query_version).
 *   2. Check parts_price_cache — return immediately if fresh.
 *   3. On miss: run Brave Search → Gemini extraction → upsert cache row.
 *   4. Return the PartPrice result.
 *
 * Parts are resolved concurrently with Promise.allSettled so one failure
 * does not block the rest.
 */

import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { searchPartPrice } from './search';
import { extractPartPrice } from './extract-price';
import { coerceWholeRand } from './coerce-rand';
import {
    PARTS_PRICE_QUERY_VERSION,
    PARTS_PRICE_TTL_MS,
    PARTS_PRICE_EMPTY_TTL_MS,
    type PartPrice,
} from './types';

// ── Cache key ──────────────────────────────────────────────────────────────────

function normSegment(s: string, maxLen: number): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, maxLen);
}

function buildCacheKey(partName: string, variant: string, regionKey: string): string {
    const p = normSegment(partName, 60);
    const v = normSegment(variant, 32);
    const r = normSegment(regionKey, 16);
    return `pp_v${PARTS_PRICE_QUERY_VERSION}_${r}_${v}_${p}`;
}

function fallbackExtractedPrice(partName: string, trade: string): {
    price_min: number | null;
    price_max: number | null;
    price_display: string | null;
} {
    const p = partName.toLowerCase();
    const t = trade.toLowerCase();

    if (/call.?out|visit fee|trip fee/.test(p)) {
        const min = t.includes('security') ? 450 : 400;
        const max = t.includes('security') ? 950 : 850;
        return { price_min: min, price_max: max, price_display: `R${min}–R${max}` };
    }
    if (/labour|labor/.test(p)) {
        const min = 450;
        const max = 900;
        return { price_min: min, price_max: max, price_display: `R${min}–R${max}/hour` };
    }
    if (/spring/.test(p)) {
        return { price_min: 600, price_max: 2200, price_display: 'R600–R2 200' };
    }
    if (/hinge|bracket|connecting rod|linkage|arm/.test(p)) {
        return { price_min: 350, price_max: 1800, price_display: 'R350–R1 800' };
    }
    if (/roller|wheel|track/.test(p)) {
        return { price_min: 250, price_max: 1600, price_display: 'R250–R1 600' };
    }
    if (/motor|capacitor|receiver|remote|gear|rack/.test(p)) {
        return { price_min: 500, price_max: 3500, price_display: 'R500–R3 500' };
    }
    return { price_min: null, price_max: null, price_display: null };
}

// ── Single-part resolution ─────────────────────────────────────────────────────

async function resolveOne(
    partName: string,
    trade: string,
    tradeDetail: string,
    regionKey: string,
): Promise<PartPrice> {
    const variant = trade;
    const cacheKey = buildCacheKey(partName, variant, regionKey);
    const admin = await createSupabaseAdminClient();
    const now = Date.now();

    // 1. Cache check
    const { data: cached } = await admin
        .from('parts_price_cache')
        .select('price_min, price_max, price_display, expires_at')
        .eq('cache_key', cacheKey)
        .maybeSingle();

    if (cached) {
        const expiresAt = cached.expires_at ? new Date(cached.expires_at).getTime() : 0;
        if (expiresAt > now) {
            const cachedPrice = {
                price_min: coerceWholeRand(cached.price_min),
                price_max: coerceWholeRand(cached.price_max),
                price_display: typeof cached.price_display === 'string' && cached.price_display.trim()
                    ? cached.price_display.trim()
                    : null,
            };
            const fallback = fallbackExtractedPrice(partName, trade);
            const withFallback =
                cachedPrice.price_min === null &&
                cachedPrice.price_max === null &&
                cachedPrice.price_display === null
                    ? fallback
                    : cachedPrice;
            return {
                part_name: partName,
                variant,
                price_min: withFallback.price_min,
                price_max: withFallback.price_max,
                price_display: withFallback.price_display,
                from_cache: true,
            };
        }
    }

    // 2. Live search + extraction
    const { sources, searchConfigured } = await searchPartPrice(partName, trade, regionKey);
    const extracted = searchConfigured && sources.length > 0
        ? await extractPartPrice(partName, trade, tradeDetail, sources)
        : { price_min: null, price_max: null, price_display: null };
    const fallback = fallbackExtractedPrice(partName, trade);
    const finalExtracted =
        extracted.price_min === null &&
        extracted.price_max === null &&
        extracted.price_display === null
            ? fallback
            : extracted;

    // 3. Cache write
    const hasPrice =
        finalExtracted.price_display !== null ||
        finalExtracted.price_min !== null ||
        finalExtracted.price_max !== null;
    const ttlMs = hasPrice ? PARTS_PRICE_TTL_MS : PARTS_PRICE_EMPTY_TTL_MS;
    const nowIso = new Date(now).toISOString();
    const expiresIso = new Date(now + ttlMs).toISOString();

    await admin.from('parts_price_cache').upsert(
        {
            cache_key: cacheKey,
            part_name: partName,
            variant,
            region_key: regionKey,
            query_version: PARTS_PRICE_QUERY_VERSION,
            fetched_at: nowIso,
            expires_at: expiresIso,
            price_min: finalExtracted.price_min,
            price_max: finalExtracted.price_max,
            price_display: finalExtracted.price_display,
            sources: sources.slice(0, 6),
            updated_at: nowIso,
        },
        { onConflict: 'cache_key' },
    );

    return {
        part_name: partName,
        variant,
        price_min: finalExtracted.price_min,
        price_max: finalExtracted.price_max,
        price_display: finalExtracted.price_display,
        from_cache: false,
    };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function lookupPartPrices(
    parts: string[],
    trade: string,
    tradeDetail: string,
    regionKey: string,
): Promise<PartPrice[]> {
    if (!parts.length) return [];

    // Deduplicate by normalised name before hitting the DB
    const seen = new Set<string>();
    const unique = parts.filter((p) => {
        const k = normSegment(p, 80);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    // Cap concurrency at 3 — each part can chain a Brave fetch + Gemini call,
    // so running all 8 simultaneously exhausts the route budget under maxDuration=30.
    const CONCURRENCY = 3;
    const settled: PromiseSettledResult<PartPrice>[] = [];
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
        const batch = unique.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
            batch.map((part) => resolveOne(part, trade, tradeDetail, regionKey)),
        );
        settled.push(...batchResults);
    }

    return settled.map((result, i) => {
        if (result.status === 'fulfilled') return result.value;
        // On error: return the part with no price rather than bubbling
        return {
            part_name: unique[i],
            variant: trade,
            price_min: null,
            price_max: null,
            price_display: null,
            from_cache: false,
        };
    });
}
