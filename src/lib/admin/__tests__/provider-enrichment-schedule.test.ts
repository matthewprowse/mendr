import { describe, it, expect } from 'vitest';
import {
    computeNextEnrichment,
    type ProviderCacheState,
    CACHE_TTL_MS,
} from '../provider-enrichment-schedule';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function state(partial: Partial<ProviderCacheState>): ProviderCacheState {
    return {
        hasCacheRow: true,
        scrapeStatus: 'ok',
        enrichmentQuality: 'high',
        scrapedAt: '2026-06-10T08:00:00.000Z',
        enrichedAt: '2026-06-10T08:01:00.000Z',
        updatedAt: '2026-06-10T08:01:00.000Z',
        needsEnrichment: false,
        ...partial,
    };
}

describe('computeNextEnrichment', () => {
    it('reports not-yet-enriched when there is no cache row', () => {
        const r = computeNextEnrichment(state({ hasCacheRow: false }), NOW);
        expect(r.at).toBeNull();
        expect(r.scheduled).toBe(false);
        expect(r.basis).toMatch(/first customer view/i);
    });

    it('healthy row refreshes 30 days after the scrape (on-demand, not scheduled)', () => {
        const r = computeNextEnrichment(state({}), NOW);
        const expected = new Date(
            new Date('2026-06-10T08:00:00.000Z').getTime() + CACHE_TTL_MS,
        ).toISOString();
        expect(r.at).toBe(expected);
        expect(r.scheduled).toBe(false);
    });

    it('failed scrape schedules the next 05:00 UTC cron after a 48h cooldown', () => {
        // scrape failed 06-15 00:00 → eligible 06-17 00:00 → next 05:00 cron is 06-17 05:00.
        const r = computeNextEnrichment(
            state({
                scrapeStatus: 'failed',
                enrichedAt: null,
                updatedAt: '2026-06-15T00:00:00.000Z',
            }),
            NOW,
        );
        expect(r.scheduled).toBe(true);
        expect(r.at).toBe('2026-06-17T05:00:00.000Z');
    });

    it('failed scrape past its cooldown is scheduled for the next upcoming cron', () => {
        // failed long ago → eligible already past → next 05:00 UTC after now (06-15 12:00) is 06-16 05:00.
        const r = computeNextEnrichment(
            state({
                scrapeStatus: 'failed',
                enrichedAt: null,
                updatedAt: '2026-06-10T08:00:00.000Z',
            }),
            NOW,
        );
        expect(r.scheduled).toBe(true);
        expect(r.at).toBe('2026-06-16T05:00:00.000Z');
    });

    it('low-quality enrichment schedules the next cron after a 24h cooldown', () => {
        // enriched 06-14 20:00 → eligible 06-15 20:00 → next 05:00 cron is 06-16 05:00.
        const r = computeNextEnrichment(
            state({ enrichmentQuality: 'low', enrichedAt: '2026-06-14T20:00:00.000Z' }),
            NOW,
        );
        expect(r.scheduled).toBe(true);
        expect(r.at).toBe('2026-06-16T05:00:00.000Z');
    });

    it('stuck row (scrape ok, never enriched) is scheduled for the retry cron', () => {
        const r = computeNextEnrichment(
            state({
                scrapeStatus: 'ok',
                enrichedAt: null,
                updatedAt: '2026-06-01T00:00:00.000Z',
            }),
            NOW,
        );
        expect(r.scheduled).toBe(true);
        // eligible (06-03) already past, so next cron is the upcoming 05:00 UTC: 06-16.
        expect(r.at).toBe('2026-06-16T05:00:00.000Z');
    });
});
