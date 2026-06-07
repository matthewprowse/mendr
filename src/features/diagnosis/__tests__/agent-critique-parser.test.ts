/**
 * Phase 2 of the Diagnosis Architecture Hardening Plan.
 *
 * Unit tests for the Agent 3 (self-critique) normaliser. No Gemini calls —
 * real-key sweeps are deferred to Phase 10.
 */

import { describe, expect, it } from 'vitest';
import { normaliseCritique } from '@/features/diagnosis/agent-critique';

const wellFormed = {
    failure_mode: 'prompt_blind_spot',
    confidence_calibration: {
        agent_confidence: 78,
        critique_confidence: 90,
        delta_reasoning:
            'User named the component directly; symptom uniquely implicates it; no contradicting evidence.',
        rubric_facets_used: ['component_named', 'symptom_unique'],
    },
    knowledge_gap: 'Whether the lifting cable is also damaged.',
    resolution_would_be: 'A close-up photo of the cable attachment point.',
    considered_alternatives: ['Snapped lifting cable', 'Opener motor over-current'],
    surprise_signals: ['User explicitly described single-side absence.'],
    prompt_hypothesis: 'output-format.ts:confidence_definition',
    notes_for_human_review:
        'Classic text-only confident case under-scored by the integer rubric.',
};

describe('normaliseCritique — well-formed input', () => {
    it('returns the expected DiagnosisCritique', () => {
        const result = normaliseCritique(wellFormed);
        expect(result).not.toBeNull();
        expect(result?.failure_mode).toBe('prompt_blind_spot');
        expect(result?.confidence_calibration!.agent_confidence).toBe(78);
        expect(result?.confidence_calibration!.critique_confidence).toBe(90);
        expect(result?.confidence_calibration!.rubric_facets_used).toEqual([
            'component_named',
            'symptom_unique',
        ]);
        expect(result?.knowledge_gap).toContain('cable');
        expect(result?.resolution_would_be).toContain('photo');
        expect(result?.considered_alternatives).toHaveLength(2);
        expect(result?.surprise_signals).toHaveLength(1);
        expect(result?.prompt_hypothesis).toBe('output-format.ts:confidence_definition');
        expect(result?.notes_for_human_review!.length).toBeGreaterThan(0);
    });
});

describe('normaliseCritique — invalid input', () => {
    it('returns null for null input', () => {
        expect(normaliseCritique(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
        expect(normaliseCritique('string')).toBeNull();
        expect(normaliseCritique(42)).toBeNull();
        expect(normaliseCritique([])).not.toBeNull(); // arrays are objects in JS — normaliser tolerates
    });
});

describe('normaliseCritique — failure_mode coercion', () => {
    it('accepts every closed-enum value', () => {
        const modes = [
            'none', 'image_quality', 'ambiguous_symptoms', 'taxonomy_gap',
            'multi_fault', 'description_unclear', 'prompt_blind_spot',
            'low_signal_evidence', 'rubric_miscalibration', 'other',
        ];
        for (const m of modes) {
            const r = normaliseCritique({ ...wellFormed, failure_mode: m });
            expect(r?.failure_mode).toBe(m);
        }
    });

    it("coerces unknown failure_mode to 'other'", () => {
        const r = normaliseCritique({ ...wellFormed, failure_mode: 'something_made_up' });
        expect(r?.failure_mode).toBe('other');
    });

    it("coerces missing failure_mode to 'other'", () => {
        const { failure_mode: _omit, ...rest } = wellFormed;
        const r = normaliseCritique(rest);
        expect(r?.failure_mode).toBe('other');
    });
});

describe('normaliseCritique — confidence_calibration', () => {
    it('clamps agent_confidence and critique_confidence to 0-100', () => {
        const r = normaliseCritique({
            ...wellFormed,
            confidence_calibration: {
                agent_confidence: -10,
                critique_confidence: 250,
                delta_reasoning: 'x',
                rubric_facets_used: [],
            },
        });
        expect(r?.confidence_calibration!.agent_confidence).toBe(0);
        expect(r?.confidence_calibration!.critique_confidence).toBe(100);
    });

    it('defaults to 0 when the field is missing or non-numeric', () => {
        const r = normaliseCritique({
            ...wellFormed,
            confidence_calibration: {
                delta_reasoning: 'x',
                rubric_facets_used: [],
            },
        });
        expect(r?.confidence_calibration!.agent_confidence).toBe(0);
        expect(r?.confidence_calibration!.critique_confidence).toBe(0);
    });

    it('drops empty rubric_facets_used entries', () => {
        const r = normaliseCritique({
            ...wellFormed,
            confidence_calibration: {
                agent_confidence: 80,
                critique_confidence: 80,
                delta_reasoning: 'x',
                rubric_facets_used: ['component_named', '', '   ', 42 as unknown as string],
            },
        });
        expect(r?.confidence_calibration!.rubric_facets_used).toEqual(['component_named']);
    });
});

describe('normaliseCritique — gap fields', () => {
    it("nullifies knowledge_gap and resolution_would_be when failure_mode='none'", () => {
        const r = normaliseCritique({
            ...wellFormed,
            failure_mode: 'none',
            knowledge_gap: 'should be ignored',
            resolution_would_be: 'should be ignored too',
        });
        expect(r?.knowledge_gap).toBeNull();
        expect(r?.resolution_would_be).toBeNull();
    });

    it('nullifies knowledge_gap when string is empty even with non-none failure mode', () => {
        const r = normaliseCritique({
            ...wellFormed,
            failure_mode: 'ambiguous_symptoms',
            knowledge_gap: '',
            resolution_would_be: '',
        });
        expect(r?.knowledge_gap).toBeNull();
        expect(r?.resolution_would_be).toBeNull();
    });

    it('preserves knowledge_gap when failure_mode is non-none and string is non-empty', () => {
        const r = normaliseCritique({
            ...wellFormed,
            failure_mode: 'ambiguous_symptoms',
            knowledge_gap: 'real gap',
            resolution_would_be: 'real resolution',
        });
        expect(r?.knowledge_gap).toBe('real gap');
        expect(r?.resolution_would_be).toBe('real resolution');
    });
});

describe('normaliseCritique — prompt_hypothesis nullification', () => {
    it('nullifies empty string prompt_hypothesis', () => {
        const r = normaliseCritique({ ...wellFormed, prompt_hypothesis: '' });
        expect(r?.prompt_hypothesis).toBeNull();
    });

    it('preserves non-empty prompt_hypothesis', () => {
        const r = normaliseCritique({ ...wellFormed, prompt_hypothesis: 'base.ts:RULE' });
        expect(r?.prompt_hypothesis).toBe('base.ts:RULE');
    });
});

describe('normaliseCritique — array hygiene', () => {
    it('drops empty entries from string arrays', () => {
        const r = normaliseCritique({
            ...wellFormed,
            considered_alternatives: ['valid', '', '   ', null as unknown as string],
            surprise_signals: ['', 'another valid'],
        });
        expect(r?.considered_alternatives).toEqual(['valid']);
        expect(r?.surprise_signals).toEqual(['another valid']);
    });

    it('defaults arrays to empty when missing', () => {
        const minimal = {
            failure_mode: 'none',
            confidence_calibration: {
                agent_confidence: 95,
                critique_confidence: 95,
                delta_reasoning: 'fine',
                rubric_facets_used: [],
            },
            knowledge_gap: '',
            resolution_would_be: '',
            notes_for_human_review: 'all good',
        };
        const r = normaliseCritique(minimal);
        expect(r).not.toBeNull();
        expect(r?.considered_alternatives).toEqual([]);
        expect(r?.surprise_signals).toEqual([]);
        expect(r?.prompt_hypothesis).toBeNull();
    });
});
