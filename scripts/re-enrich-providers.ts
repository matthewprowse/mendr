/**
 * Provider re-enrichment script.
 *
 * Sources candidates from the `providers` table (LEFT JOIN provider_cache) so it
 * can reach providers that have NO cache row at all — the largest enrichment gap,
 * which the previous cache-only query was blind to.
 *
 * Candidates are grouped into cohorts:
 *   - no-cache   : no provider_cache row AND (has website OR rating_count >= 5)
 *   - fast-only  : scrape_status = 'fast_only' AND has website (full pipeline never ran)
 *   - bad-bio    : scrape_status = 'ok' but bio is missing/short (<40 chars) — AI output was poor
 *   - pending    : scrape_status = 'pending' with missing/short bio — never fully enriched
 *
 * Re-enrichment runs at the app's CURRENT cache version (no override), so rows get
 * enrichment_quality='ok' written — which is what actually marks them fresh. Bumping
 * the version here would make the live match flow treat every row as stale. Do not.
 *
 * Usage (from app/ directory):
 *   npx tsx scripts/re-enrich-providers.ts
 *
 * Optional env overrides:
 *   COHORTS=no-cache,fast-only   — comma-separated cohorts to process
 *                                  (default: no-cache,fast-only,bad-bio,pending)
 *   BATCH_SIZE=10                — providers processed per batch (default 5)
 *   DELAY_MS=3000                — ms between batches (default 3000)
 *   DRY_RUN=1                    — print eligible providers without processing
 *   PROVIDER_IDS=uuid1,uuid2     — process specific providers only (ignores cohorts)
 *   LIMIT=50                     — cap total providers processed (default: no cap)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { enrichProvider } from '../src/lib/providers/provider-enrichment';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy from your Supabase project settings.');
    process.exit(1);
}

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? '5');
const DELAY_MS = Number(process.env.DELAY_MS ?? '3000');
const DRY_RUN = process.env.DRY_RUN === '1';
const PROVIDER_IDS = process.env.PROVIDER_IDS ? process.env.PROVIDER_IDS.split(',').map((s) => s.trim()).filter(Boolean) : null;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;

const ALL_COHORTS = ['no-cache', 'fast-only', 'bad-bio', 'pending'] as const;
type Cohort = (typeof ALL_COHORTS)[number];
const COHORTS: Cohort[] = (process.env.COHORTS
    ? process.env.COHORTS.split(',').map((s) => s.trim())
    : [...ALL_COHORTS]
).filter((c): c is Cohort => (ALL_COHORTS as readonly string[]).includes(c));

const MIN_BIO_CHARS = 40;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ProviderRow {
    id: string;
    name: string | null;
    website: string | null;
    rating_count: number | null;
    specialisations: string[] | null;
}

interface CacheRow {
    provider_id: string;
    scrape_status: string | null;
    bio: string | null;
}

interface Candidate {
    id: string;
    name: string;
    cohort: Cohort;
    trade: string | undefined;
}

function classify(p: ProviderRow, cache: CacheRow | undefined): Cohort | null {
    const hasWebsite = typeof p.website === 'string' && p.website.trim().length > 0;
    const ratingCount = p.rating_count ?? 0;
    const bioLen = (cache?.bio ?? '').trim().length;

    if (!cache) {
        // No cache row at all — worth enriching if there's a website or enough reviews.
        if (hasWebsite || ratingCount >= 5) return 'no-cache';
        return null;
    }
    if (cache.scrape_status === 'fast_only' && hasWebsite) return 'fast-only';
    if (cache.scrape_status === 'ok' && bioLen < MIN_BIO_CHARS) return 'bad-bio';
    if (cache.scrape_status === 'pending' && bioLen < MIN_BIO_CHARS) return 'pending';
    return null;
}

async function fetchAll<T>(
    table: string,
    columns: string,
): Promise<T[]> {
    const pageSize = 1000;
    let from = 0;
    const out: T[] = [];
    for (;;) {
        const { data, error } = await admin
            .from(table)
            .select(columns)
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
    }
    return out;
}

async function main() {
    console.log('── Mendr Re-Enrichment Script ──────────────────────────────────');
    console.log(`COHORTS=${COHORTS.join(',') || '(none)'}, BATCH_SIZE=${BATCH_SIZE}, DELAY_MS=${DELAY_MS}, DRY_RUN=${DRY_RUN}${LIMIT ? `, LIMIT=${LIMIT}` : ''}`);

    if (COHORTS.length === 0 && !PROVIDER_IDS) {
        console.error('No valid cohorts selected. Valid: ' + ALL_COHORTS.join(', '));
        process.exit(1);
    }

    let candidates: Candidate[];

    if (PROVIDER_IDS) {
        const providers = await fetchAll<ProviderRow>(
            'providers',
            'id, name, website, rating_count, specialisations',
        );
        const byId = new Map(providers.map((p) => [p.id, p]));
        candidates = PROVIDER_IDS.map((id) => {
            const p = byId.get(id);
            return {
                id,
                name: p?.name ?? id,
                cohort: 'no-cache' as Cohort,
                trade: p?.specialisations?.[0],
            };
        });
    } else {
        // Source from providers (active only) LEFT JOIN provider_cache, joined in JS.
        const [providers, cacheRows] = await Promise.all([
            fetchAll<ProviderRow & { is_active: boolean }>(
                'providers',
                'id, name, website, rating_count, specialisations, is_active',
            ),
            fetchAll<CacheRow>('provider_cache', 'provider_id, scrape_status, bio'),
        ]);
        const cacheById = new Map(cacheRows.map((c) => [c.provider_id, c]));
        candidates = [];
        for (const p of providers) {
            if (!p.is_active) continue;
            const cohort = classify(p, cacheById.get(p.id));
            if (cohort && COHORTS.includes(cohort)) {
                candidates.push({
                    id: p.id,
                    name: p.name ?? p.id,
                    cohort,
                    trade: p.specialisations?.[0],
                });
            }
        }
    }

    if (LIMIT && candidates.length > LIMIT) candidates = candidates.slice(0, LIMIT);

    if (candidates.length === 0) {
        console.log('No providers match the selected cohorts. All done.');
        return;
    }

    // Cohort breakdown
    const byCohort = candidates.reduce<Record<string, number>>((acc, c) => {
        acc[c.cohort] = (acc[c.cohort] ?? 0) + 1;
        return acc;
    }, {});
    console.log(`Found ${candidates.length} candidate(s):`, JSON.stringify(byCohort));

    if (DRY_RUN) {
        console.log('\nDRY RUN — candidates:');
        for (const c of candidates) {
            console.log(`  [${c.cohort}] ${c.name} (${c.id.slice(0, 8)}…)`);
        }
        return;
    }

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(candidates.length / BATCH_SIZE)}`);

        await Promise.allSettled(
            batch.map(async (c) => {
                console.log(`  → [${c.cohort}] ${c.name} (${c.id.slice(0, 8)}…)`);
                try {
                    // No cacheVersion override: enrich at the app's current version so
                    // enrichment_quality='ok' marks the row fresh without version churn.
                    const result = await enrichProvider(c.id, { trade: c.trade || undefined });
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

        if (i + BATCH_SIZE < candidates.length) {
            console.log(`Waiting ${DELAY_MS}ms before next batch…`);
            await sleep(DELAY_MS);
        }
    }

    console.log('\n── Summary ───────────────────────────────────────────────────────');
    console.log(`  Enriched: ${succeeded}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Failed:   ${failed}`);
    console.log(`  Total:    ${candidates.length}`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
