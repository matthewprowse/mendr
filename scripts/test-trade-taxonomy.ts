/**
 * Sanity checks for diagnosis-trade-taxonomy inference + coerce path.
 * Run: npm run test:trade-taxonomy
 */
import assert from 'node:assert/strict';
import {
    inferTradeFromSignals,
    getSubcategoryById,
} from '../src/lib/diagnosis-trade-taxonomy';
import { finalizeClassificationAgainstCatalogAndTaxonomy } from '../src/app/api/diagnose/agent-classify';

const g = inferTradeFromSignals('Garage door motor stripped');
assert(g);
assert.equal(g!.trade, 'Security & Access');
assert.equal(g!.subcategoryId, 'garage_door_fault');

const p = inferTradeFromSignals(
    'Geyser element dead no hot water but cylinder fine',
);
assert.equal(p!.trade, 'Electrical');

assert.equal(getSubcategoryById('garage_door_fault')!.label, 'Garage Door Fault');

const allowed = ['Security & Access', 'Plumbing', 'Electrical', 'General Handyman'];

const raw = finalizeClassificationAgainstCatalogAndTaxonomy(
    {
        subcategory_id: 'garage_door_fault',
        trade: 'General Handyman',
        trade_detail: 'Something Else',
        confidence: 90,
        rejected: false,
        requires_clarification: false,
        unserviced: false,
        refetch_providers: false,
        unsupported_reason: '',
        urgency_key: 'soon',
    },
    allowed,
);
assert.equal(raw.trade, 'Security & Access');
assert.equal(raw.trade_detail, 'Garage Door Fault');
assert.equal(raw.subcategory_id, 'garage_door_fault');

console.log('Trade taxonomy checks passed.');
