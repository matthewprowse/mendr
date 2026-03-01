#!/usr/bin/env npx tsx
/**
 * Provider cache scraper – pre-populates cached_providers by searching areas + trades.
 *
 * - Areas: grid covering the whole Western Cape (see config).
 * - Trades: ONLY from Supabase `services` table (active only); no hardcoded list.
 * - Progress: completed (area_key, trade) stored in Supabase scrape_task_done so the run
 *   can resume after a stop (crash, rate limit, Ctrl+C).
 *
 * Run: npm run dev, then npm run scrape-providers (or SCRAPE_BASE_URL=... for production).
 * Requires: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * Load .env.local from app dir when run via npm run scrape-providers.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

const cwd = process.cwd();
// Load .env then .env.local (Next.js order; .env.local overrides). Ensures Supabase vars are available when run via npx tsx.
config({ path: resolve(cwd, '.env') });
config({ path: resolve(cwd, '.env.local') });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SCRAPE_AREAS } from './config/scrape-areas';
import type { ScrapeArea } from './config/scrape-areas';

const BASE_URL = process.env.SCRAPE_BASE_URL || 'http://localhost:3000';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '0', 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.SCRAPE_CONCURRENCY || '8', 10));
const REQUEST_TIMEOUT_MS = parseInt(process.env.SCRAPE_REQUEST_TIMEOUT_MS || '120000', 10);
const DRY_RUN = process.env.SCRAPE_DRY_RUN === '1' || process.env.SCRAPE_DRY_RUN === 'true';

function getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error(
            'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).'
        );
    }
    return createClient(url, key);
}

/** Stable key for an area (matches grid rounding so same cell = same key). */
function toAreaKey(area: ScrapeArea): string {
    const lat = Math.round(area.lat * 100) / 100;
    const lng = Math.round(area.lng * 100) / 100;
    return `${lat}_${lng}_${area.radiusM}`;
}

/** Fetch active trades (search_query) from Supabase services table, ordered by sort_order. */
async function getTradesFromSupabase(supabase: SupabaseClient): Promise<string[]> {
    const { data, error } = await supabase
        .from('services')
        .select('search_query')
        .eq('active', true)
        .order('sort_order', { ascending: true });
    if (error) {
        throw new Error(`Failed to fetch services: ${error.message}`);
    }
    const trades = (data ?? []).map((row: { search_query: string }) => row.search_query).filter(Boolean);
    return trades;
}

/** Load set of completed task keys "area_key|trade" from scrape_task_done. */
async function loadCompletedTaskKeys(supabase: SupabaseClient): Promise<Set<string>> {
    const { data, error } = await supabase.from('scrape_task_done').select('area_key, trade');
    if (error) {
        console.warn('Could not load scrape progress:', error.message);
        return new Set();
    }
    const set = new Set<string>();
    for (const row of data ?? []) {
        set.add(`${row.area_key}|${row.trade}`);
    }
    return set;
}

/** Record (area_key, trade) as completed so we can skip it on resume. */
async function markTaskDone(
    supabase: SupabaseClient,
    areaKey: string,
    trade: string
): Promise<void> {
    await supabase.from('scrape_task_done').upsert(
        { area_key: areaKey, trade, completed_at: new Date().toISOString() },
        { onConflict: 'area_key,trade' }
    );
}

async function fetchProviders(
    lat: number,
    lng: number,
    trade: string,
    radiusM: number
): Promise<{ ok: boolean; count: number; error?: string }> {
    const url = `${BASE_URL}/api/providers`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lat,
            lng,
            trade,
            radius: radiusM,
        }),
        signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, count: 0, error: data.error || res.statusText };
    }
    const providers = data.providers || [];
    const emerging = data.emergingProviders || [];
    const nearby = data.nearbyOnlyProviders || [];
    const count = providers.length + emerging.length + nearby.length;
    return { ok: true, count };
}

function isTimeoutError(err: unknown): boolean {
    if (err instanceof Error) {
        if (err.name === 'AbortError') return true;
        if (err.cause instanceof Error && err.cause.message?.includes('Timeout')) return true;
    }
    return false;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** Run up to `concurrency` promises at a time. */
async function runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    async function worker(): Promise<void> {
        while (next < items.length) {
            const i = next++;
            const item = items[i];
            results[i] = await fn(item, i);
            if (DELAY_MS > 0) await sleep(DELAY_MS);
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

async function main() {
    console.log('Provider cache scraper');
    console.log('=====================');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Concurrency: ${CONCURRENCY}`);
    console.log(`Delay between requests: ${DELAY_MS}ms`);
    console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms`);
    console.log(`Dry run: ${DRY_RUN}`);
    console.log('');

    let supabase: SupabaseClient;
    try {
        supabase = getSupabase();
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }

    let trades: string[];
    try {
        trades = await getTradesFromSupabase(supabase);
        console.log(`Trades from Supabase (services): ${trades.length} — ${trades.join(', ')}\n`);
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }

    const completedKeys = await loadCompletedTaskKeys(supabase);
    const allTasks: { area: ScrapeArea; trade: string }[] = [];
    for (const area of SCRAPE_AREAS) {
        for (const trade of trades) {
            allTasks.push({ area, trade });
        }
    }
    const tasks = allTasks.filter(
        ({ area, trade }) => !completedKeys.has(`${toAreaKey(area)}|${trade}`)
    );
    const skipped = allTasks.length - tasks.length;
    if (skipped > 0) {
        console.log(`Resuming: ${skipped} already done, ${tasks.length} pending.\n`);
    }

    const total = tasks.length;
    if (total === 0) {
        console.log('Nothing left to do. All area × trade tasks are already completed.');
        return;
    }

    if (DRY_RUN) {
        tasks.slice(0, 20).forEach(({ area, trade }) => console.log(`  [dry] ${area.name} / ${trade}`));
        if (tasks.length > 20) console.log(`  ... and ${tasks.length - 20} more`);
        console.log('\n=====================');
        console.log(`Done: ${total} pending (dry run)`);
        return;
    }

    let cached = 0;
    let failed = 0;

    await runWithConcurrency(tasks, CONCURRENCY, async ({ area, trade }) => {
        let result: { ok: boolean; count: number; error?: string };
        try {
            result = await fetchProviders(area.lat, area.lng, trade, area.radiusM);
        } catch (err) {
            result = {
                ok: false,
                count: 0,
                error: isTimeoutError(err) ? 'Request timed out (try SCRAPE_REQUEST_TIMEOUT_MS)' : (err as Error).message,
            };
        }
        if (result.ok) {
            cached += result.count;
            await markTaskDone(supabase, toAreaKey(area), trade);
            console.log(`  ✓ ${area.name} / ${trade}: ${result.count} providers`);
        } else {
            failed++;
            const msg = result.error || 'failed';
            console.log(`  ✗ ${area.name} / ${trade}: ${msg}`);
        }
        return result;
    });

    console.log('\n=====================');
    console.log(`Done: ${total} requests`);
    console.log(`Providers touched (fetched/enriched): ${cached}`);
    if (failed > 0) console.log(`Failed: ${failed}`);
}

main().catch((e) => {
    console.error('Scraper error:', e);
    process.exit(1);
});
