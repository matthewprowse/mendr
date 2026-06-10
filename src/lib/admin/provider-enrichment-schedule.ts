/**
 * Derive enrichment timing for a live provider, for the admin directory.
 *
 * Mendr never stores an explicit "next enrichment" timestamp — re-enrichment is
 * driven by two mechanisms, both mirrored here:
 *
 *   1. The daily `retry-enrichment` cron (05:00 UTC) re-runs full enrichment for
 *      cache rows that are `failed` (older than 48h), `low` quality (older than
 *      24h), or stuck (scrape ok but `enriched_at` null).
 *   2. Healthy rows simply go stale after the 30-day cache TTL and are refreshed
 *      on-demand the next time a customer opens the provider — there is no cron
 *      for these, so we report the staleness date, not a guaranteed run.
 *
 * Keep the constants in sync with `provider-enrichment.ts` and the cron schedule
 * in `vercel.json`.
 */

export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LOW_QUALITY_RETRY_MS = 24 * 60 * 60 * 1000;
export const FAILED_RETRY_MS = 48 * 60 * 60 * 1000;
/** UTC hour the daily retry-enrichment cron fires (see vercel.json: "0 5 * * *"). */
export const RETRY_CRON_UTC_HOUR = 5;

export type ProviderCacheState = {
    /** Whether a provider_cache row exists at all. */
    hasCacheRow: boolean;
    scrapeStatus: string | null;
    enrichmentQuality: string | null;
    scrapedAt: string | null;
    enrichedAt: string | null;
    updatedAt: string | null;
    needsEnrichment: boolean;
};

export type NextEnrichment = {
    /** ISO timestamp of the next expected enrichment, or null when unknown/none. */
    at: string | null;
    /** Whether `at` is a scheduled cron run (true) or an on-demand/staleness estimate (false). */
    scheduled: boolean;
    /** Human-readable explanation of how `at` was derived. */
    basis: string;
};

/** Next occurrence of RETRY_CRON_UTC_HOUR:00 UTC at or after `fromMs`. */
function nextCronRun(fromMs: number): number {
    const d = new Date(fromMs);
    const candidate = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        RETRY_CRON_UTC_HOUR,
        0,
        0,
        0,
    );
    return candidate >= fromMs ? candidate : candidate + 24 * 60 * 60 * 1000;
}

function ms(value: string | null): number | null {
    if (!value) return null;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
}

export function computeNextEnrichment(state: ProviderCacheState, now: Date): NextEnrichment {
    const nowMs = now.getTime();

    if (!state.hasCacheRow) {
        return {
            at: null,
            scheduled: false,
            basis: 'Not yet enriched — runs on first customer view',
        };
    }

    const scrapedMs = ms(state.scrapedAt);
    const enrichedMs = ms(state.enrichedAt);
    const updatedMs = ms(state.updatedAt);

    // 1. Failed scrape — retry cron picks it up 48h after the last attempt.
    if (state.scrapeStatus === 'failed') {
        const base = updatedMs ?? scrapedMs ?? nowMs;
        const eligible = base + FAILED_RETRY_MS;
        return {
            at: new Date(nextCronRun(Math.max(eligible, nowMs))).toISOString(),
            scheduled: true,
            basis: 'Failed scrape — daily retry cron (05:00 UTC) after a 48h cooldown',
        };
    }

    // 2. Stuck — scrape ok but AI enrichment never completed.
    if (state.scrapeStatus === 'ok' && !enrichedMs) {
        const base = updatedMs ?? scrapedMs ?? nowMs;
        const eligible = base + FAILED_RETRY_MS;
        return {
            at: new Date(nextCronRun(Math.max(eligible, nowMs))).toISOString(),
            scheduled: true,
            basis: 'Scrape ok but enrichment incomplete — daily retry cron (05:00 UTC)',
        };
    }

    // 3. Low quality — retry cron picks it up 24h after the last enrichment.
    if (state.enrichmentQuality === 'low' && enrichedMs) {
        const eligible = enrichedMs + LOW_QUALITY_RETRY_MS;
        return {
            at: new Date(nextCronRun(Math.max(eligible, nowMs))).toISOString(),
            scheduled: true,
            basis: 'Low-quality enrichment — daily retry cron (05:00 UTC) after a 24h cooldown',
        };
    }

    // 4. Healthy — no cron. Refreshes on the next customer view after the 30-day TTL.
    if (scrapedMs) {
        return {
            at: new Date(scrapedMs + CACHE_TTL_MS).toISOString(),
            scheduled: false,
            basis: 'Cache valid for 30 days — refreshes on the next customer view after this date',
        };
    }

    return {
        at: null,
        scheduled: false,
        basis: 'Refreshes on demand when a customer views the profile',
    };
}
