#!/usr/bin/env npx tsx
/**
 * Sync reviews (and opening hours, etc.) for every provider in cached_providers.
 * Calls the app's refresh-cache endpoint for each place_id so Google Place Details
 * is fetched and cached_providers.reviews is updated.
 *
 * Note: Google Places API returns a maximum of 5 reviews per place. This script
 * ensures every cached provider has those reviews stored; the app then displays
 * up to 50 reviews per provider (for when we have more from other sources).
 *
 * Run with dev server: npm run dev, then npm run sync-provider-reviews
 * Or: SYNC_BASE_URL=https://your-domain.com npm run sync-provider-reviews
 */
import { config } from 'dotenv';
import { resolve } from 'path';

const cwd = process.cwd();
config({ path: resolve(cwd, '.env') });
config({ path: resolve(cwd, '.env.local') });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BASE_URL = process.env.SYNC_BASE_URL || process.env.SCRAPE_BASE_URL || 'http://localhost:3000';
const CONCURRENCY = Math.max(1, parseInt(process.env.SYNC_CONCURRENCY || '5', 10));
const DELAY_MS = parseInt(process.env.SYNC_DELAY_MS || '200', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.SYNC_REQUEST_TIMEOUT_MS || '15000', 10);
const DRY_RUN = process.env.SYNC_DRY_RUN === '1' || process.env.SYNC_DRY_RUN === 'true';

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

async function refreshProvider(placeId: string): Promise<{ ok: boolean; reviews_count: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`${BASE_URL}/api/providers/refresh-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place_id: placeId }),
        signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, reviews_count: 0 };
    }
    return { ok: data.ok ?? false, reviews_count: data.reviews_count ?? 0 };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

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
    console.log('Sync provider reviews');
    console.log('=====================');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Concurrency: ${CONCURRENCY}`);
    console.log(`Delay between requests: ${DELAY_MS}ms`);
    console.log(`Dry run: ${DRY_RUN}`);
    console.log('');

    let supabase: SupabaseClient;
    try {
        supabase = getSupabase();
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }

    const { data: rows, error } = await supabase
        .from('cached_providers')
        .select('place_id')
        .not('place_id', 'is', null);

    if (error) {
        console.error('Failed to load cached_providers:', error.message);
        process.exit(1);
    }

    const placeIds = (rows ?? []).map((r: { place_id: string }) => r.place_id).filter(Boolean);
    console.log(`Found ${placeIds.length} providers in cache.\n`);

    if (placeIds.length === 0) {
        console.log('Nothing to do.');
        return;
    }

    if (DRY_RUN) {
        placeIds.slice(0, 10).forEach((id, i) => console.log(`  [dry] ${i + 1}. ${id}`));
        if (placeIds.length > 10) console.log(`  ... and ${placeIds.length - 10} more`);
        return;
    }

    let okCount = 0;
    let reviewsTotal = 0;

    await runWithConcurrency(placeIds, CONCURRENCY, async (placeId, i) => {
        const result = await refreshProvider(placeId);
        if (result.ok) {
            okCount++;
            reviewsTotal += result.reviews_count;
            console.log(`  ✓ ${i + 1}/${placeIds.length} ${placeId} (${result.reviews_count} reviews)`);
        } else {
            console.log(`  ✗ ${i + 1}/${placeIds.length} ${placeId}`);
        }
        return result;
    });

    console.log('\n=====================');
    console.log(`Done: ${placeIds.length} providers`);
    console.log(`Refreshed: ${okCount}`);
    console.log(`Total reviews synced: ${reviewsTotal}`);
}

main().catch((e) => {
    console.error('Sync error:', e);
    process.exit(1);
});
