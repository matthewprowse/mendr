#!/usr/bin/env npx tsx
/**
 * Provider cache scraper – pre-populates cached_providers by searching areas + trades.
 *
 * How it works (similar to Uber/类似 companies):
 * - Define geographic cells (lat/lng + radius)
 * - For each cell × trade: call the providers API (Google Places + AI enrichment)
 * - Results are saved to cached_providers; future user searches hit cache
 *
 * Run with dev server: npm run dev (in one terminal), then npm run scrape-providers
 * Or: SCRAPE_BASE_URL=https://your-domain.com npm run scrape-providers
 */

import { SCRAPE_AREAS, SCRAPE_TRADES } from './config/scrape-areas';

const BASE_URL = process.env.SCRAPE_BASE_URL || 'http://localhost:3000';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '2000', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.SCRAPE_REQUEST_TIMEOUT_MS || '120000', 10);
const DRY_RUN = process.env.SCRAPE_DRY_RUN === '1' || process.env.SCRAPE_DRY_RUN === 'true';

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

async function main() {
    console.log('Provider cache scraper');
    console.log('=====================');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Delay between requests: ${DELAY_MS}ms`);
    console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms`);
    console.log(`Dry run: ${DRY_RUN}`);
    console.log('');

    const total = SCRAPE_AREAS.length * SCRAPE_TRADES.length;
    let done = 0;
    let cached = 0;
    let failed = 0;

    for (const area of SCRAPE_AREAS) {
        console.log(`\n📍 ${area.name} (${(area.radiusM / 1000).toFixed(0)}km radius)`);
        for (const trade of SCRAPE_TRADES) {
            if (DRY_RUN) {
                console.log(`  [dry] ${trade}`);
                done++;
                continue;
            }
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
            done++;
            if (result.ok) {
                cached += result.count;
                console.log(`  ✓ ${trade}: ${result.count} providers cached`);
            } else {
                failed++;
                const msg = result.error || 'failed';
                console.log(`  ✗ ${trade}: ${msg}`);
            }
            if (done < total) await sleep(DELAY_MS);
        }
    }

    console.log('\n=====================');
    console.log(`Done: ${done} requests`);
    if (!DRY_RUN) {
        console.log(`Providers touched (fetched/enriched): ${cached}`);
        if (failed > 0) console.log(`Failed: ${failed}`);
    }
}

main().catch((e) => {
    console.error('Scraper error:', e);
    process.exit(1);
});
