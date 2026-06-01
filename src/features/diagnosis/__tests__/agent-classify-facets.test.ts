/**
 * Phase 4 of the Diagnosis Architecture Hardening Plan — structured uncertainty.
 *
 * Tests for the facet fields added to Agent 2a's classification output:
 *   - trade_confidence / component_confidence / cause_confidence (integers 0-100)
 *   - image_sufficiency (closed enum)
 *   - committed_observations / explicit_unknowns (string arrays)
 *   - Legacy `confidence` derivation from facets when omitted by the model.
 *
 * These exercise the parser+finalize boundary directly — no Gemini calls.
 */

import { describe, it, expect } from 'vitest';
import { parseClassificationResponse } from '../agent-classify';

const ALLOWED_TRADES = [
    'Security',
    'Plumbing',
    'Electrical',
    'Building & Construction',
    'Pool Maintenance',
    'General Handyman',
];

function rawJson(obj: Record<string, unknown>): string {
    return JSON.stringify(obj);
}

const baseFields = {
    subcategory_id: 'garage_door_fault',
    trade: 'Security',
    trade_detail: 'Garage Door Fault / Repair',
    rejected: false,
    requires_clarification: false,
    unserviced: false,
    refetch_providers: false,
    unsupported_reason: '',
    failed_component: 'torsion spring',
    cascading_damage: '',
    trade_candidates: [{ trade: 'Security', score: 92 }],
};

describe('Phase 4 facets — well-formed input', () => {
    it('returns all facet fields when model emits them', () => {
        const out = parseClassificationResponse(
            rawJson({
                ...baseFields,
                confidence: 90,
                trade_confidence: 95,
                component_confidence: 90,
                cause_confidence: 85,
                image_sufficiency: 'absent',
                committed_observations: [
                    'door opens partially',
                    'one torsion spring is missing',
                ],
                explicit_unknowns: ['whether the lifting cable is also damaged'],
            }),
            ALLOWED_TRADES,
        );
        expect(out).not.toBeNull();
        expect(out?.facets).toBeDefined();
        expect(out?.facets?.trade_confidence).toBe(95);
        expect(out?.facets?.component_confidence).toBe(90);
        expect(out?.facets?.cause_confidence).toBe(85);
        expect(out?.facets?.image_sufficiency).toBe('absent');
        expect(out?.facets?.committed_observations).toHaveLength(2);
        expect(out?.facets?.explicit_unknowns).toEqual([
            'whether the lifting cable is also damaged',
        ]);
    });

    it('derives confidence from facets even when the model also emits an aggregate', () => {
        // Per plan §Phase 4: legacy `confidence` is mechanically min(component, cause)
        // when facets are present. Any model-emitted aggregate is ignored so the Phase 11
        // shadow comparison attributes drift purely to facet changes.
        const out = parseClassificationResponse(
            rawJson({
                ...baseFields,
                confidence: 78,
                trade_confidence: 95,
                component_confidence: 90,
                cause_confidence: 85,
                image_sufficiency: 'absent',
                committed_observations: [],
                explicit_unknowns: [],
            }),
            ALLOWED_TRADES,
        );
        expect(out?.confidence).toBe(85);
    });
});

describe('Phase 4 facets — back-compat (model returned no facets)', () => {
    it('returns no facets object and preserves the legacy confidence', () => {
        const out = parseClassificationResponse(
            rawJson({ ...baseFields, confidence: 80 }),
            ALLOWED_TRADES,
        );
        expect(out).not.toBeNull();
        expect(out?.facets).toBeUndefined();
        expect(out?.confidence).toBe(80);
    });
});

describe('Phase 4 facets — derivation', () => {
    it('derives legacy confidence as min(component, cause) when model omits it', () => {
        const out = parseClassificationResponse(
            rawJson({
                ...baseFields,
                // confidence omitted entirely
                trade_confidence: 95,
                component_confidence: 90,
                cause_confidence: 70,
                image_sufficiency: 'sufficient',
                committed_observations: [],
                explicit_unknowns: [],
            }),
            ALLOWED_TRADES,
        );
        expect(out?.confidence).toBe(70);
    });

    it('derives correctly when the model emits confidence=0 (facets remain authoritative)', () => {
        const out = parseClassificationResponse(
            rawJson({
                ...baseFields,
                confidence: 0,
                trade_confidence: 95,
                component_confidence: 88,
                cause_confidence: 60,
                image_sufficiency: 'partial',
                committed_observations: [],
                explicit_unknowns: [],
            }),
            ALLOWED_TRADES,
        );
        expect(out?.confidence).toBe(60);
    });
});

describe('Phase 4 facets — clamping + coercion', () => {
    it('clamps facet integers to 0-100', () => {
        const out = parseClassificationResponse(
            rawJson({
                ...baseFields,
                confidence: 90,
                trade_confidence: -5,
                component_confidence: 999,
                cause_confidence: 87.6,
                image_sufficiency: 'sufficient',
                committed_observations: [],
                explicit_unknowns: [],
            }),
            ALLOWED_TRADES,
        );
        expect(out?.facets?.trade_confidence).toBe(0);
        expect(out?.facets?.component_confidence).toBe(100);
        // Rounded to nearest integer.
        expect(out?.facets?.cause_confidence).toBe(88);
    });

    it("coerces unknown image_sufficiency value to 'absent'", () => {
        const out = parseClassificationResponse(
            rawJson({
                ...baseFields,
                confidence: 90,
                trade_confidence: 90,
                component_confidence: 90,
                cause_confidence: 90,
                image_sufficiency: 'made-up-value',
                committed_observations: [],
                explicit_unknowns: [],
            }),
            ALLOWED_TRADES,
        );
        expect(out?.facets?.image_sufficiency).toBe('absent');
    });

    it('accepts every valid image_sufficiency enum value', () => {
        const values = ['sufficient', 'partial', 'unhelpful', 'absent'] as const;
        for (const v of values) {
            const out = parseClassificationResponse(
                rawJson({
                    ...baseFields,
                    confidence: 90,
                    trade_confidence: 90,
                    component_confidence: 90,
                    cause_confidence: 90,
                    image_sufficiency: v,
                    committed_observations: [],
                    explicit_unknowns: [],
                }),
                ALLOWED_TRADES,
            );
            expect(out?.facets?.image_sufficiency).toBe(v);
        }
    });

    it('drops empty/non-string entries from facet string arrays', () => {
        const out = parseClassificationResponse(
            rawJson({
                ...baseFields,
                confidence: 90,
                trade_confidence: 90,
                component_confidence: 90,
                cause_confidence: 90,
                image_sufficiency: 'sufficient',
                committed_observations: [
                    'valid fact',
                    '',
                    '   ',
                    42 as unknown as string,
                    null as unknown as string,
                ],
                explicit_unknowns: ['', 'another valid unknown'],
            }),
            ALLOWED_TRADES,
        );
        expect(out?.facets?.committed_observations).toEqual(['valid fact']);
        expect(out?.facets?.explicit_unknowns).toEqual(['another valid unknown']);
    });
});
