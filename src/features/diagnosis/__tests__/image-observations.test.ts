/**
 * Unit tests for Phase 5 — image_observations normalisation and the
 * server-side derivation of image_descriptions from image_observations.
 */

import { describe, expect, it } from 'vitest';
import { normaliseImageObservations } from '../agent-prose';

describe('normaliseImageObservations', () => {
    it('returns [] when input is not an array', () => {
        expect(normaliseImageObservations(undefined)).toEqual([]);
        expect(normaliseImageObservations(null)).toEqual([]);
        expect(normaliseImageObservations('nope')).toEqual([]);
        expect(normaliseImageObservations({})).toEqual([]);
    });

    it('returns [] for empty array', () => {
        expect(normaliseImageObservations([])).toEqual([]);
    });

    it('coerces missing fields to safe defaults', () => {
        const result = normaliseImageObservations([{}]);
        expect(result).toEqual([
            {
                primary_observation: '',
                components_visible: [],
                components_missing_or_damaged: [],
                role_in_diagnosis: 'context_only',
            },
        ]);
    });

    it('coerces unknown role_in_diagnosis to context_only', () => {
        const result = normaliseImageObservations([
            {
                primary_observation: 'spring missing',
                components_visible: ['bracket'],
                components_missing_or_damaged: ['left spring'],
                role_in_diagnosis: 'wibble',
            },
        ]);
        expect(result[0].role_in_diagnosis).toBe('context_only');
    });

    it('preserves all four valid roles', () => {
        const result = normaliseImageObservations([
            { role_in_diagnosis: 'primary_evidence' },
            { role_in_diagnosis: 'corroborating' },
            { role_in_diagnosis: 'contradicting' },
            { role_in_diagnosis: 'context_only' },
        ]);
        expect(result.map((o) => o.role_in_diagnosis)).toEqual([
            'primary_evidence',
            'corroborating',
            'contradicting',
            'context_only',
        ]);
    });

    it('filters non-string entries in component arrays', () => {
        const result = normaliseImageObservations([
            {
                primary_observation: 'left torsion spring is missing from its bracket',
                components_visible: ['right torsion spring', 42, null, 'cable'],
                components_missing_or_damaged: ['left torsion spring', undefined],
                role_in_diagnosis: 'primary_evidence',
            },
        ]);
        expect(result[0].components_visible).toEqual(['right torsion spring', 'cable']);
        expect(result[0].components_missing_or_damaged).toEqual(['left torsion spring']);
    });

    it('drops non-object entries silently', () => {
        const result = normaliseImageObservations([
            null,
            'string',
            42,
            { primary_observation: 'kept', role_in_diagnosis: 'corroborating' },
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].primary_observation).toBe('kept');
    });
});

/**
 * The post-parse normalisation in agent-prose.ts derives image_descriptions
 * from image_observations when the former is missing or empty. We replicate
 * the exact derivation logic here to confirm it does the right thing without
 * spinning up a real Gemini call.
 */
describe('image_descriptions backward-compat derivation', () => {
    const derive = (
        imageDescriptions: string[] | undefined,
        imageObservations: ReturnType<typeof normaliseImageObservations>,
    ): string[] => {
        let result = Array.isArray(imageDescriptions) ? imageDescriptions : [];
        if (result.length === 0 && imageObservations.length > 0) {
            result = imageObservations
                .map((o) => o.primary_observation)
                .filter((s) => typeof s === 'string' && s.trim().length > 0);
        }
        return result;
    };

    it('returns image_descriptions when already populated', () => {
        const obs = normaliseImageObservations([
            { primary_observation: 'A', role_in_diagnosis: 'primary_evidence' },
        ]);
        expect(derive(['existing'], obs)).toEqual(['existing']);
    });

    it('derives image_descriptions from observations when empty', () => {
        const obs = normaliseImageObservations([
            {
                primary_observation: 'left torsion spring is missing from its bracket',
                role_in_diagnosis: 'primary_evidence',
            },
            {
                primary_observation: 'connecting rod is bent at midpoint',
                role_in_diagnosis: 'corroborating',
            },
        ]);
        expect(derive([], obs)).toEqual([
            'left torsion spring is missing from its bracket',
            'connecting rod is bent at midpoint',
        ]);
    });

    it('derives image_descriptions when undefined', () => {
        const obs = normaliseImageObservations([
            { primary_observation: 'one', role_in_diagnosis: 'primary_evidence' },
        ]);
        expect(derive(undefined, obs)).toEqual(['one']);
    });

    it('skips observations with empty primary_observation', () => {
        const obs = normaliseImageObservations([
            { primary_observation: '', role_in_diagnosis: 'primary_evidence' },
            { primary_observation: 'real', role_in_diagnosis: 'corroborating' },
        ]);
        expect(derive([], obs)).toEqual(['real']);
    });

    it('returns [] when both are empty', () => {
        expect(derive([], [])).toEqual([]);
    });
});
