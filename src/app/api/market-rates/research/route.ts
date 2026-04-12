import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { buildProviderQuery } from '@/app/api/providers/query-builder';
import {
    buildMarketRatesCacheKey,
    buildMarketRatesFallbackSpecs,
    buildMarketRatesQuerySpecs,
    type MarketRatesQuerySpec,
} from '@/lib/market-rates/build-queries';
import { inferRegionKeyFromAddress } from '@/lib/market-rates/region';
import { runBraveWebSearch } from '@/lib/market-rates/brave-web-search';
import { trimSecretEnv } from '@/lib/market-rates/secret-env';
import { buildModelContextFromSources } from '@/lib/market-rates/model-context';
import { refineCostsFromMarketContext } from '@/lib/market-rates/refine-costs';
import {
    MARKET_RATES_EMPTY_FETCH_TTL_MS,
    MARKET_RATES_QUERY_VERSION,
    MARKET_RATES_TTL_MS,
    MAX_BRAVE_WEB_CALLS,
    type MarketRateSource,
    type MarketRatesRefinedCosts,
} from '@/lib/market-rates/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dedupeSources(sources: MarketRateSource[]): MarketRateSource[] {
    const seen = new Set<string>();
    const out: MarketRateSource[] = [];
    for (const s of sources) {
        const key = s.url.split('#')[0].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
        if (out.length >= 12) break;
    }
    return out;
}

function mergeRefinedIntoBaseline(
    baseline: Record<string, unknown>,
    refined: MarketRatesRefinedCosts | null
): Record<string, unknown> {
    if (!refined) return { ...baseline };
    const next = { ...baseline };
    if (typeof refined.estimated_cost === 'string' && refined.estimated_cost.trim()) {
        next.estimated_cost = refined.estimated_cost.trim();
    }
    delete next.repair_cost_range;
    delete next.replacement_cost_range;
    delete next.equipment_parts_range;
    return next;
}

export async function POST(req: NextRequest) {
    const limited = checkRateLimit(req, 'marketRatesResearch');
    if (limited) return limited;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const trade = typeof body.trade === 'string' ? body.trade.trim() : '';
    if (!trade || trade.toLowerCase() === 'n/a') {
        return NextResponse.json({ error: 'trade is required' }, { status: 400 });
    }

    const tradeDetail = typeof body.tradeDetail === 'string' ? body.tradeDetail.trim() : '';
    const customerAddress =
        typeof body.customerAddress === 'string' ? body.customerAddress.trim() : '';
    const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const baselineDiagnosis =
        body.baselineDiagnosis && typeof body.baselineDiagnosis === 'object'
            ? (body.baselineDiagnosis as Record<string, unknown>)
            : {};

    const { tradeNorm, detailKeyForCache } = buildProviderQuery({
        trade,
        tradeDetail: tradeDetail || undefined,
    });
    const regionKey = inferRegionKeyFromAddress(customerAddress);
    const cacheKey = buildMarketRatesCacheKey({
        regionKey,
        tradeNorm,
        detailKey: detailKeyForCache,
        queryVersion: MARKET_RATES_QUERY_VERSION,
    });

    const braveSearchConfigured = Boolean(trimSecretEnv(process.env.BRAVE_SEARCH_API_KEY));
    const searchConfigured = braveSearchConfigured;

    const now = Date.now();
    let responseFetchedAt = new Date(now).toISOString();
    const nowIso = responseFetchedAt;
    let expiresAt = new Date(now + MARKET_RATES_TTL_MS).toISOString();

    let admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>;
    try {
        admin = await createSupabaseAdminClient();
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ error: msg, skipped: true }, { status: 500 });
    }

    const { data: cached, error: cacheReadErr } = await admin
        .from('market_rates_cache')
        .select('sources, model_context, refined_costs, expires_at, fetched_at')
        .eq('cache_key', cacheKey)
        .maybeSingle();

    if (cacheReadErr) {
        return NextResponse.json({ error: cacheReadErr.message }, { status: 500 });
    }

    const cachedSourcesList: MarketRateSource[] = Array.isArray(cached?.sources)
        ? (cached.sources as MarketRateSource[])
        : [];
    let sources: MarketRateSource[] = cachedSourcesList;
    let modelContext = typeof cached?.model_context === 'string' ? cached.model_context : '';
    let refinedCosts =
        cached?.refined_costs && typeof cached.refined_costs === 'object'
            ? (cached.refined_costs as MarketRatesRefinedCosts)
            : null;
    let fromCache = false;

    type WebSearchCallDiag = {
        intent: string;
        http_status: number;
        error: string | null;
        result_count: number;
    };
    let webSearchCalls: WebSearchCallDiag[] | null = null;

    const rowExpiresMs =
        cached && typeof (cached as { expires_at?: string }).expires_at === 'string'
            ? new Date((cached as { expires_at: string }).expires_at).getTime()
            : 0;
    const rowNotExpired = rowExpiresMs > now;

    const useCachedMarketRates =
        Boolean(cached) &&
        rowNotExpired &&
        (!searchConfigured || cachedSourcesList.length > 0);

    if (useCachedMarketRates) {
        fromCache = true;
        const rowFetched = (cached as { fetched_at?: string })?.fetched_at;
        if (typeof rowFetched === 'string' && rowFetched) responseFetchedAt = rowFetched;
    } else {
        const searchCalls: WebSearchCallDiag[] = [];
        const braveQueriesUsed: { intent: string; q: string }[] = [];
        let braveAttempted = false;
        let braveCallsRemaining = MAX_BRAVE_WEB_CALLS;

        const runBraveSpecList = async (specList: MarketRatesQuerySpec[]): Promise<MarketRateSource[]> => {
            if (!braveSearchConfigured || braveCallsRemaining <= 0) return [];
            const slice = specList.slice(0, braveCallsRemaining);
            if (slice.length === 0) return [];
            braveCallsRemaining -= slice.length;
            const batches = await Promise.all(
                slice.map((s) => runBraveWebSearch(s.query, s.intent))
            );
            slice.forEach((s, i) => {
                const r = batches[i];
                if (r.httpStatus > 0) braveAttempted = true;
                braveQueriesUsed.push({ intent: s.intent, q: s.query });
                searchCalls.push({
                    intent: s.intent,
                    http_status: r.httpStatus,
                    error: r.errorMessage ?? null,
                    result_count: r.sources.length,
                });
            });
            return batches.flatMap((b) => b.sources);
        };

        const specs = buildMarketRatesQuerySpecs({ trade, tradeDetail: tradeDetail || null });
        sources = dedupeSources(await runBraveSpecList(specs));

        let fallbackSpecsRan: ReturnType<typeof buildMarketRatesFallbackSpecs> | null = null;
        if (braveSearchConfigured && braveCallsRemaining > 0 && sources.length < 8) {
            fallbackSpecsRan = buildMarketRatesFallbackSpecs({ trade, tradeDetail: tradeDetail || null });
            sources = dedupeSources([...sources, ...(await runBraveSpecList(fallbackSpecsRan))]);
        }

        webSearchCalls = searchCalls.length > 0 ? searchCalls : null;

        modelContext = buildModelContextFromSources(sources);

        if (sources.length === 0 && braveAttempted) {
            expiresAt = new Date(now + MARKET_RATES_EMPTY_FETCH_TTL_MS).toISOString();
        }

        const diagnosisTitle =
            typeof baselineDiagnosis.diagnosis === 'string'
                ? baselineDiagnosis.diagnosis.trim()
                : trade;

        const jobScopeHint = [
            typeof baselineDiagnosis.action_required === 'string'
                ? baselineDiagnosis.action_required.trim()
                : '',
            typeof baselineDiagnosis.message === 'string' ? baselineDiagnosis.message.trim() : '',
        ]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 2000);

        refinedCosts = await refineCostsFromMarketContext({
            diagnosisTitle,
            trade,
            tradeDetail,
            modelContext,
            jobScopeHint: jobScopeHint || undefined,
            baseline: {
                estimated_cost:
                    typeof baselineDiagnosis.estimated_cost === 'string'
                        ? baselineDiagnosis.estimated_cost
                        : '',
                repair_cost_range:
                    typeof baselineDiagnosis.repair_cost_range === 'string'
                        ? baselineDiagnosis.repair_cost_range
                        : '',
                replacement_cost_range:
                    typeof baselineDiagnosis.replacement_cost_range === 'string'
                        ? baselineDiagnosis.replacement_cost_range
                        : '',
                equipment_parts_range:
                    typeof baselineDiagnosis.equipment_parts_range === 'string'
                        ? baselineDiagnosis.equipment_parts_range
                        : '',
            },
        });

        const rawSpecs = [
            ...specs.map((s) => ({ intent: s.intent, q: s.query })),
            ...(fallbackSpecsRan ?? []).map((s) => ({ intent: s.intent, q: s.query })),
        ];

        const { error: upsertErr } = await admin.from('market_rates_cache').upsert(
            {
                cache_key: cacheKey,
                region_key: regionKey,
                trade_norm: tradeNorm,
                detail_key: detailKeyForCache,
                query_version: MARKET_RATES_QUERY_VERSION,
                fetched_at: nowIso,
                expires_at: expiresAt,
                sources,
                model_context: modelContext || null,
                refined_costs: refinedCosts ?? null,
                raw_bundle: { specs: rawSpecs },
                updated_at: nowIso,
            },
            { onConflict: 'cache_key' }
        );

        if (upsertErr) {
            return NextResponse.json({ error: upsertErr.message }, { status: 500 });
        }
    }

    const marketRatesMeta = {
        from_cache: fromCache,
        fetched_at: responseFetchedAt,
        region_key: regionKey,
        sources,
    };

    const webSearchPayload = {
        provider: 'brave' as const,
        configured: braveSearchConfigured,
        from_cache: fromCache,
        calls: webSearchCalls,
    };

    let persisted = false;
    if (conversationId && UUID_RE.test(conversationId) && Object.keys(baselineDiagnosis).length > 0) {
        const merged = mergeRefinedIntoBaseline(baselineDiagnosis, refinedCosts);
        (merged as Record<string, unknown>).market_rates = marketRatesMeta;

        const { error: patchErr } = await admin
            .from('diagnoses')
            .update({
                diagnosis: merged as unknown,
                updated_at: nowIso,
            })
            .eq('id', conversationId);

        persisted = !patchErr;
        if (patchErr) {
            return NextResponse.json(
                {
                    ok: true,
                    from_cache: fromCache,
                    sources,
                    refined_costs: refinedCosts,
                    market_rates: marketRatesMeta,
                    persisted: false,
                    persist_error: patchErr.message,
                    web_search: webSearchPayload,
                    search_configured: searchConfigured,
                    brave_search_configured: braveSearchConfigured,
                },
                { status: 200 }
            );
        }
    }

    return NextResponse.json({
        ok: true,
        from_cache: fromCache,
        sources,
        refined_costs: refinedCosts,
        market_rates: marketRatesMeta,
        persisted,
        search_configured: searchConfigured,
        brave_search_configured: braveSearchConfigured,
        web_search: webSearchPayload,
    });
}
