import assert from 'node:assert/strict';
import { buildProviderQuery } from '../src/app/api/providers/query-builder';
import { rankProviders } from '../src/app/api/providers/ranking';
import { withTimeout } from '../src/app/api/providers/review-enrichment';
import { buildSearchCacheKey } from '../src/app/api/providers/cache';
import type { ProviderItem } from '../src/app/api/providers/contracts';

const query = buildProviderQuery({
    trade: 'Plumbing',
    tradeDetail: 'Borehole Drilling',
});
assert.equal(query.tradeNorm, 'plumbing');
assert.equal(query.isBoreholeLikeDetail, true);
assert(query.searchQuery.toLowerCase().includes('borehole'));
assert.equal(query.canonicalServiceLabel, 'Plumbing');

const providers: ProviderItem[] = [
    {
        placeId: 'p1',
        name: 'Alpha',
        address: 'A',
        rating: 4.9,
        ratingCount: 20,
        latitude: null,
        longitude: null,
        distanceKm: 12,
        durationText: '',
        website: null,
        phone: null,
        summary: 'ok',
        specialisations: [],
        isOpen: null,
    },
    {
        placeId: 'p2',
        name: 'Bravo',
        address: 'B',
        rating: 4.7,
        ratingCount: 120,
        latitude: null,
        longitude: null,
        distanceKm: 2,
        durationText: '',
        website: null,
        phone: null,
        summary: 'ok',
        specialisations: [],
        isOpen: null,
    },
];
const ranked = rankProviders(providers, 2);
assert.equal(ranked.length, 2);
assert.equal(ranked[0].placeId, 'p2');

async function main() {
    const slow = withTimeout(
        new Promise<string>((resolve) => setTimeout(() => resolve('late'), 40)),
        5
    );
    const fast = withTimeout(Promise.resolve('ok'), 50);
    assert.equal(await slow, null);
    assert.equal(await fast, 'ok');

    const cacheKey = buildSearchCacheKey({
        lat: -33.912345,
        lng: 18.412345,
        tradeNorm: 'plumbing',
        detailKeyForCache: 'borehole',
        radius: 25000,
    });
    assert(cacheKey.includes('plumbing_borehole_25000'));

    console.log('Match flow checks passed.');
}

void main();
