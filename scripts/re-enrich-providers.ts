/**
 * One-time re-enrichment script.
 *
 * Finds all providers where the enrichment pipeline has not completed
 * (enriched_at IS NULL) but raw content exists (scrape_status = 'ok' OR
 * raw_scrape_text IS NOT NULL), then re-runs enrichProvider() on each.
 *
 * Usage (from app/ directory):
 *   npx tsx scripts/re-enrich-providers.ts
 *
 * Optional env overrides:
 *   BATCH_SIZE=10      — providers processed per batch (default 5)
 *   DELAY_MS=3000      — ms between batches (default 3000)
 *   DRY_RUN=1          — print eligible providers without processing
 *   PROVIDER_IDS=uuid1,uuid2 — process specific providers only
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { enrichProvider } from '../src/lib/provider-enrichment';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy from your Supabase project settings.');
    process.exit(1);
}

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? '5');
const DELAY_MS = Number(process.env.DELAY_MS ?? '3000');
const DRY_RUN = process.env.DRY_RUN === '1';
const PROVIDER_IDS = process.env.PROVIDER_IDS ? process.env.PROVIDER_IDS.split(',').map((s) => s.trim()) : null;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    console.log('── Menda Re-Enrichment Script ──────────────────────────────────');
    console.log(`BATCH_SIZE=${BATCH_SIZE}, DELAY_MS=${DELAY_MS}, DRY_RUN=${DRY_RUN}`);

    // Find providers eligible for re-enrichment.
    // Eligible = have a provider_cache row where enriched_at is null
    //   AND (scrape_status = 'ok' OR raw_scrape_text IS NOT NULL)
    // This catches providers whose scrape succeeded but whose AI call failed.
    let query = admin
        .from('provider_cache')
        .select('provider_id, scrape_status, scraped_at, enriched_at, raw_scrape_text')
        .is('enriched_at', null)
        .neq('scrape_status', 'skip');

    if (PROVIDER_IDS) {
        query = query.in('provider_id', PROVIDER_IDS);
    }

    const { data: cacheRows, error } = await query.order('scraped_at', { ascending: false });

    if (error) {
        console.error('Failed to query provider_cache:', error.message);
        process.exit(1);
    }

    const eligible = (cacheRows ?? []).filter(
        (r) => r.scrape_status === 'ok' || (r.raw_scrape_text && r.raw_scrape_text.length > 100)
    );

    if (eligible.length === 0) {
        console.log('No providers need re-enrichment. All done.');
        return;
    }

    console.log(`Found ${eligible.length} provider(s) eligible for re-enrichment.`);

    if (DRY_RUN) {
        console.log('\nDRY RUN — eligible provider IDs:');
        for (const r of eligible) {
            console.log(`  ${r.provider_id}  scrape_status=${r.scrape_status}  scraped_at=${r.scraped_at}`);
        }
        return;
    }

    // Fetch provider names for logging
    const providerIds = eligible.map((r) => r.provider_id as string);
    const { data: providerRows } = await admin
        .from('providers')
        .select('id, name, service_categories')
        .in('id', providerIds);
    const nameById = new Map<string, string>();
    const tradeById = new Map<string, string>();
    for (const p of providerRows ?? []) {
        nameById.set(p.id, p.name ?? p.id);
        const cats = Array.isArray(p.service_categories) ? p.service_categories : [];
        tradeById.set(p.id, (cats[0] as string | undefined) ?? '');
    }

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
        const batch = eligible.slice(i, i + BATCH_SIZE);
        console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(eligible.length / BATCH_SIZE)}`);

        await Promise.allSettled(
            batch.map(async (row) => {
                const id = row.provider_id as string;
                const name = nameById.get(id) ?? id;
                const trade = tradeById.get(id);
                console.log(`  → ${name} (${id.slice(0, 8)}…)`);
                try {
                    const result = await enrichProvider(id, { trade: trade || undefined });
                    if (result.skipped) {
                        console.log(`    ✓ Skipped: ${result.reason}`);
                        skipped++;
                    } else if (result.ok) {
                        console.log(`    ✓ Enriched`);
                        succeeded++;
                    } else {
                        console.log(`    ✗ Failed: ${result.reason}`);
                        failed++;
                    }
                } catch (err) {
                    console.log(`    ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
                    failed++;
                }
            })
        );

        if (i + BATCH_SIZE < eligible.length) {
            console.log(`Waiting ${DELAY_MS}ms before next batch…`);
            await sleep(DELAY_MS);
        }
    }

    console.log('\n── Summary ───────────────────────────────────────────────────────');
    console.log(`  Enriched: ${succeeded}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Failed:   ${failed}`);
    console.log(`  Total:    ${eligible.length}`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
