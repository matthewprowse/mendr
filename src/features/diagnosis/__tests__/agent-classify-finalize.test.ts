/**
 * Ported from scripts/test-trade-taxonomy.ts — the catalogue/taxonomy coerce
 * path inside finalizeClassificationAgainstCatalogAndTaxonomy.
 */
import { describe, it, expect } from 'vitest';
import { finalizeClassificationAgainstCatalogAndTaxonomy } from '../agent-classify';

const ALLOWED = [
    'Security',
    'Plumbing',
    'Electrical',
    'General Handyman',
];

describe('finalizeClassificationAgainstCatalogAndTaxonomy', () => {
    it('rewrites trade + detail when the subcategory_id resolves to a different trade', () => {
        const out = finalizeClassificationAgainstCatalogAndTaxonomy(
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
                failed_component: '',
                cascading_damage: '',
            },
            ALLOWED
        );
        expect(out.trade).toBe('Security');
        expect(out.trade_detail).toBe('Garage Door Fault / Repair');
        expect(out.subcategory_id).toBe('garage_door_fault');
    });

    it('falls back to the canonical allowed label when the subcategory is unknown', () => {
        const out = finalizeClassificationAgainstCatalogAndTaxonomy(
            {
                subcategory_id: 'not_a_real_id',
                trade: 'Plumbing',
                trade_detail: 'Burst Pipe',
                confidence: 80,
                rejected: false,
                requires_clarification: false,
                unserviced: false,
                refetch_providers: false,
                unsupported_reason: '',
                failed_component: '',
                cascading_damage: '',
            },
            ALLOWED
        );
        expect(out.trade).toBe('Plumbing');
    });

    it('preserves the rejected flag and clears trade/detail mapping when rejected', () => {
        const out = finalizeClassificationAgainstCatalogAndTaxonomy(
            {
                subcategory_id: 'garage_door_fault',
                trade: 'Security',
                trade_detail: 'Garage Door Fault / Repair',
                confidence: 10,
                rejected: true,
                requires_clarification: false,
                unserviced: false,
                refetch_providers: false,
                unsupported_reason: '',
                failed_component: '',
                cascading_damage: '',
            },
            ALLOWED
        );
        expect(out.rejected).toBe(true);
    });
});
