/**
 * Unit tests for the response-builder extracted from /api/diagnose/route.ts
 * in Phase 2.
 *
 * These tests pin the most important branches of `buildCompatibleResponseText`
 * — they form part of the safety net for the route handler refactor.
 *
 * Covers:
 *   - The pure trade-aware clarification chip helpers.
 *   - The `inferTradeFromProseFallback` heuristic.
 *   - End-to-end response shape for: happy path, rejected, unserviced, low-
 *     confidence requires-clarification, classification fallback, diagnosis
 *     rejected (repeated diagnosis), and fail-soft (requestFailed).
 */
import { describe, it, expect } from 'vitest';
import {
    buildCompatibleResponseText,
    buildTradeFallbackClarificationChips,
    inferTradeFromProseFallback,
    reconcileTradeFromDiagnosisSignals,
    type BuildCompatibleResponseInput,
} from '../response-builder';
import type { ClassificationResult } from '@/features/diagnosis/agent-classify';
import type { ProseResult } from '@/features/diagnosis/agent-prose';

const SERVICE_LIST = [
    'Security',
    'Plumbing',
    'Electrical',
    'Building',
    'Carpentry',
    'Painting',
    'Pool',
    'Locksmith',
    'Welding',
    'General Handyman',
];

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
    return {
        trade: 'Plumbing',
        trade_detail: 'Burst Pipe / Major Leak',
        subcategory_id: 'burst_pipe_leak',
        confidence: 92,
        rejected: false,
        requires_clarification: false,
        unserviced: false,
        refetch_providers: false,
        unsupported_reason: '',
        failed_component: 'copper supply line at elbow joint',
        cascading_damage: '',
        ...overrides,
    };
}

function makeProse(overrides: Partial<ProseResult> = {}): ProseResult {
    return {
        thought:
            'The image shows water surfacing near the boundary wall with a drop in pressure across the house. This is the classic pattern of a mains-side burst on the supply line. The leak is on the supply side because the meter continues to register flow when no taps are open. The wet patch is downstream of the meter, and there is no plumbing fixture in the immediate area.',
        diagnosis: 'Burst Pipe On Mains Supply',
        estimated_diagnosis_sentence: 'Burst Pipe On Mains Supply',
        message: 'The mains supply has burst near the boundary wall.',
        action_required: '',
        contractor_checklist: ['Excavate.', 'Repair pipe.'],
        homeowner_prep: 'Close the main stop valve.',
        image_descriptions: ['Wet patch near the boundary wall.'],
        image_observations: [],
        clarification_questions: [],
        diy_verification: '',
        photo_request: '',
        confidence_drivers: [],
        ...overrides,
    };
}

function makeInput(
    overrides: Partial<BuildCompatibleResponseInput> = {},
): BuildCompatibleResponseInput {
    return {
        thoughtText:
            'Composed thought text long enough to satisfy the 50-character minimum threshold.',
        classification: makeClassification(),
        prose: makeProse(),
        serviceList: SERVICE_LIST,
        previousDiagnosis: null,
        diagnosisRejected: false,
        history: [],
        initialImageDescription: '',
        textQuery: 'water is leaking somewhere on the property',
        imageCountAfterTier: 1,
        hasImage: true,
        attachmentCount: 0,
        ...overrides,
    };
}

function parseJsonBlock(out: string): Record<string, unknown> {
    const match = out.match(/<json>([\s\S]+)<\/json>/);
    if (!match) throw new Error('no <json> block in output');
    return JSON.parse(match[1]) as Record<string, unknown>;
}

describe('buildTradeFallbackClarificationChips', () => {
    it.each([
        ['electrical', /no power/i],
        ['plumbing', /leak/i],
        ['security', /gate/i],
        ['pool', /pump/i],
        ['carpentry', /door/i],
        ['painting', /paint/i],
        ['flooring', /tile/i],
        ['building', /crack/i],
        ['handyman', /odd job/i],
        ['locksmith', /lock/i],
        ['welding', /metal/i],
    ])('returns trade-specific chips for %s', (trade, expectedPattern) => {
        const chips = buildTradeFallbackClarificationChips(trade);
        expect(chips.length).toBeGreaterThanOrEqual(3);
        expect(chips.length).toBeLessThanOrEqual(4);
        expect(chips.some((c) => expectedPattern.test(c))).toBe(true);
        expect(chips[chips.length - 1].toLowerCase()).toContain('something else');
    });

    it('returns a generic catch-all set for unknown trades', () => {
        const chips = buildTradeFallbackClarificationChips('martian-engineering');
        expect(chips.length).toBe(4);
        expect(chips[3].toLowerCase()).toContain('something else');
    });
});

describe('inferTradeFromProseFallback', () => {
    it('recognises plumbing keywords', () => {
        expect(inferTradeFromProseFallback('There is a leak in the pipe', SERVICE_LIST))
            .toBe('Plumbing');
    });

    it('recognises electrical keywords', () => {
        expect(inferTradeFromProseFallback('The DB board is tripping', SERVICE_LIST))
            .toBe('Electrical');
    });

    it('recognises security keywords (gate motor / garage door)', () => {
        expect(inferTradeFromProseFallback('garage door is broken', SERVICE_LIST))
            .toBe('Security');
    });

    it('returns empty string for empty input', () => {
        expect(inferTradeFromProseFallback('', SERVICE_LIST)).toBe('');
        expect(inferTradeFromProseFallback(undefined, SERVICE_LIST)).toBe('');
    });
});

describe('reconcileTradeFromDiagnosisSignals', () => {
    it('rewrites a General Handyman trade when prose clearly indicates plumbing', () => {
        const finalJson: Record<string, unknown> = {
            trade: 'General Handyman',
            trade_detail: '',
            subcategory_id: 'none_unmapped',
            diagnosis: 'Burst pipe behind wall',
            estimated_diagnosis_sentence: 'Burst pipe behind wall',
            message: 'There is a burst pipe leaking water inside the wall cavity.',
        };
        reconcileTradeFromDiagnosisSignals(
            finalJson,
            { trade: 'General Handyman', subcategory_id: 'none_unmapped' },
            SERVICE_LIST,
        );
        expect(finalJson.trade).toBe('Plumbing');
    });

    it('does NOT rewrite an explicitly classified non-handyman trade', () => {
        const finalJson: Record<string, unknown> = {
            trade: 'Plumbing',
            diagnosis: 'gate motor is broken',
            message: 'gate motor needs repair',
            subcategory_id: 'burst_pipe_leak',
        };
        reconcileTradeFromDiagnosisSignals(
            finalJson,
            { trade: 'Plumbing', subcategory_id: 'burst_pipe_leak' },
            SERVICE_LIST,
        );
        // Should keep Plumbing — classification is locked, subcategory is real.
        expect(finalJson.trade).toBe('Plumbing');
    });

    it('does nothing when rejected is true', () => {
        const finalJson: Record<string, unknown> = {
            trade: 'General Handyman',
            rejected: true,
            diagnosis: 'pipe leak',
            subcategory_id: 'none_unmapped',
        };
        reconcileTradeFromDiagnosisSignals(
            finalJson,
            { trade: 'General Handyman', subcategory_id: 'none_unmapped' },
            SERVICE_LIST,
        );
        expect(finalJson.trade).toBe('General Handyman');
    });
});

describe('buildCompatibleResponseText — happy path', () => {
    it('emits a <thought>…</thought><json>…</json> envelope', () => {
        const out = buildCompatibleResponseText(makeInput());
        expect(out).toMatch(/^<thought>[\s\S]+<\/thought>\n<json>[\s\S]+<\/json>$/);
    });

    it('includes the classification trade verbatim in the JSON', () => {
        const out = buildCompatibleResponseText(makeInput());
        const json = parseJsonBlock(out);
        expect(json.trade).toBe('Plumbing');
        expect(json.subcategory_id).toBe('burst_pipe_leak');
    });

    it('attaches the structural_confidence block', () => {
        const out = buildCompatibleResponseText(makeInput());
        const json = parseJsonBlock(out);
        expect(json).toHaveProperty('structural_confidence');
        expect((json.structural_confidence as Record<string, unknown>).score).toBeDefined();
    });
});

describe('buildCompatibleResponseText — rejected', () => {
    it('overrides diagnosis and trade for a rejected (non-home) image', () => {
        const out = buildCompatibleResponseText(
            makeInput({
                classification: makeClassification({
                    rejected: true,
                    trade: 'N/A',
                    trade_detail: '',
                }),
            }),
        );
        const json = parseJsonBlock(out);
        expect(json.diagnosis).toBe('Photo Not Related to Home Maintenance');
        expect(json.trade).toBe('N/A');
        expect(json.requires_clarification).toBe(true);
    });
});

describe('buildCompatibleResponseText — unserviced', () => {
    it('overrides diagnosis with the unsupported-service message', () => {
        const out = buildCompatibleResponseText(
            makeInput({
                classification: makeClassification({
                    unserviced: true,
                    trade: 'N/A',
                    trade_detail: '',
                }),
            }),
        );
        const json = parseJsonBlock(out);
        expect(json.diagnosis).toBe('Service Not Currently Supported');
        expect(json.trade).toBe('N/A');
    });
});

describe('buildCompatibleResponseText — requires_clarification fallback', () => {
    it('populates clarification_questions from the trade-fallback when empty', () => {
        const out = buildCompatibleResponseText(
            makeInput({
                classification: makeClassification({ requires_clarification: true }),
                prose: makeProse({ clarification_questions: [] }),
            }),
        );
        const json = parseJsonBlock(out);
        const chips = json.clarification_questions as string[];
        expect(Array.isArray(chips)).toBe(true);
        expect(chips.length).toBeGreaterThan(0);
    });
});

describe('buildCompatibleResponseText — requestFailed fail-soft', () => {
    it('caps confidence and forces requires_clarification when classification failed', () => {
        const out = buildCompatibleResponseText(
            makeInput({
                classification: makeClassification({ requestFailed: true, confidence: 90 }),
            }),
        );
        const json = parseJsonBlock(out);
        expect(json.requires_clarification).toBe(true);
        expect(Number(json.confidence)).toBeLessThanOrEqual(65);
    });

    it('also handles the prose-failed case', () => {
        const out = buildCompatibleResponseText(
            makeInput({
                prose: makeProse({ requestFailed: true }),
            }),
        );
        const json = parseJsonBlock(out);
        expect(json.requires_clarification).toBe(true);
        expect(Number(json.confidence)).toBeLessThanOrEqual(65);
    });
});

describe('buildCompatibleResponseText — diagnosis rejected (repeat)', () => {
    it('forces clarification when the user rejected a previous identical diagnosis', () => {
        const out = buildCompatibleResponseText(
            makeInput({
                diagnosisRejected: true,
                previousDiagnosis: {
                    diagnosis: 'Burst Pipe On Mains Supply',
                    trade: 'Plumbing',
                },
            }),
        );
        const json = parseJsonBlock(out);
        expect(json.diagnosis).toBe('Needs Clarification');
        expect(json.requires_clarification).toBe(true);
        expect(String(json.message)).toMatch(/Sorry for getting that wrong/);
    });
});

describe('buildCompatibleResponseText — likely classification fallback', () => {
    it('infers a trade from prose when classification fell back to N/A 0', () => {
        const out = buildCompatibleResponseText(
            makeInput({
                classification: makeClassification({
                    trade: 'N/A',
                    trade_detail: '',
                    subcategory_id: 'none_unmapped',
                    confidence: 0,
                    rejected: false,
                    unserviced: false,
                    unsupported_reason: '',
                }),
                prose: makeProse({
                    diagnosis: 'Burst pipe behind wall',
                    message: 'A burst pipe is leaking water inside the wall cavity.',
                }),
            }),
        );
        const json = parseJsonBlock(out);
        expect(json.trade).toBe('Plumbing');
        expect(json.requires_clarification).toBe(true);
        expect(Number(json.confidence)).toBeGreaterThanOrEqual(72);
    });
});
