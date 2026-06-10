/**
 * Tests for diagnosis-display.ts — pure display helpers.
 */

import { describe, it, expect } from 'vitest';
import {
    cleanThoughtSentenceStarts,
    splitDetailAndHazard,
    reportThoughtsParagraph,
    diagnosisSectionsDuplicate,
} from '../diagnosis-display';

// ── cleanThoughtSentenceStarts ────────────────────────────────────────────────

describe('cleanThoughtSentenceStarts', () => {
    it('returns empty string for empty input', () => {
        expect(cleanThoughtSentenceStarts('')).toBe('');
    });

    it('strips leading filler article from a sentence', () => {
        const result = cleanThoughtSentenceStarts('The geyser appears to be leaking from the base.');
        // "The" filler stripped, rest of sentence capitalised
        expect(result).not.toMatch(/^The\s/);
        expect(result.charAt(0)).toMatch(/[A-Z]/);
    });

    it('normalises "the user" to "you"', () => {
        const result = cleanThoughtSentenceStarts('The user is experiencing water damage.');
        expect(result.toLowerCase()).toContain('you');
        expect(result.toLowerCase()).not.toContain('user');
    });

    it('normalises "homeowner" to "you"', () => {
        const result = cleanThoughtSentenceStarts('The homeowner should call a plumber.');
        expect(result.toLowerCase()).not.toContain('homeowner');
        expect(result.toLowerCase()).toContain('you');
    });

    it('capitalises the first letter of the cleaned result', () => {
        const result = cleanThoughtSentenceStarts('a burst pipe is causing the flooding.');
        expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
    });

    it('processes multiple sentences independently', () => {
        const input = 'The geyser is leaking. It needs attention.';
        const result = cleanThoughtSentenceStarts(input);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('does not crash on whitespace-only input', () => {
        expect(() => cleanThoughtSentenceStarts('   ')).not.toThrow();
    });
});

// ── splitDetailAndHazard ──────────────────────────────────────────────────────

describe('splitDetailAndHazard', () => {
    it('returns detail=raw and hazard="" when no hazard sentence found', () => {
        const text = 'The geyser element has failed. It needs to be replaced by a plumber.';
        const { detail, hazard } = splitDetailAndHazard(text);
        expect(detail).toBe(text);
        expect(hazard).toBe('');
    });

    it('splits hazard sentences containing "avoid" into the hazard field', () => {
        const text = 'The geyser is leaking. Avoid using hot water until repaired.';
        const { detail, hazard } = splitDetailAndHazard(text);
        expect(hazard).toContain('Avoid');
        expect(detail).not.toContain('Avoid');
    });

    it('splits on "do not" hazard pattern', () => {
        const text = 'The circuit is damaged. Do not reset the breaker yourself.';
        const { detail, hazard } = splitDetailAndHazard(text);
        expect(hazard).toContain('Do not');
    });

    it('splits on "switch off" hazard pattern', () => {
        const text = 'The DB board has a fault. Switch off the main breaker immediately.';
        const { detail, hazard } = splitDetailAndHazard(text);
        expect(hazard).toContain('Switch off');
    });

    it('returns empty detail when all sentences are hazards', () => {
        const text = 'Switch off immediately. Never reset the breaker without an electrician.';
        const { detail, hazard } = splitDetailAndHazard(text);
        expect(hazard.length).toBeGreaterThan(0);
        expect(detail.trim()).toBe('');
    });

    it('handles empty and null input gracefully', () => {
        expect(splitDetailAndHazard('')).toEqual({ detail: '', hazard: '' });
        expect(splitDetailAndHazard(null as unknown as string)).toEqual({ detail: '', hazard: '' });
        expect(splitDetailAndHazard(undefined as unknown as string)).toEqual({ detail: '', hazard: '' });
    });

    it('limits hazard to at most 3 sentences', () => {
        const hazardSentences = [
            'Avoid using water.',
            'Do not reset the breaker.',
            'Never touch live wires.',
            'Switch off the main supply.',
        ].join(' ');
        const { hazard } = splitDetailAndHazard(hazardSentences);
        const sentenceCount = hazard.split(/(?<=[.!?])\s+/).filter(Boolean).length;
        expect(sentenceCount).toBeLessThanOrEqual(3);
    });
});

// ── reportThoughtsParagraph ────────────────────────────────────────────────────

describe('reportThoughtsParagraph', () => {
    it('returns empty string when diagnosis is null and no initial description', () => {
        expect(reportThoughtsParagraph(null, null)).toBe('');
    });

    it('uses initialImageDescription when diagnosis is null', () => {
        const result = reportThoughtsParagraph(null, 'The crack runs from the corner.');
        expect(result.length).toBeGreaterThan(0);
        expect(result.toLowerCase()).toContain('crack');
    });

    it('returns empty string when initial description is empty and diagnosis is null', () => {
        expect(reportThoughtsParagraph(null, '   ')).toBe('');
    });

    it('uses thinking field from diagnosis when present', () => {
        const diagnosis = { thinking: 'The motor shows signs of corrosion.' };
        const result = reportThoughtsParagraph(diagnosis, null);
        expect(result).toContain('corrosion');
    });

    it('falls back to image_descriptions[0] when thinking is absent', () => {
        const diagnosis = { image_descriptions: ['Rust visible on the gate motor housing.'] };
        const result = reportThoughtsParagraph(diagnosis, null);
        expect(result).toContain('Rust');
    });

    it('falls back to initialImageDescription when diagnosis has neither thinking nor image_descriptions', () => {
        const result = reportThoughtsParagraph({}, 'Water staining on the ceiling above.');
        expect(result).toContain('Water staining');
    });

    it('prefers thinking over image_descriptions and initialImageDescription', () => {
        const diagnosis = {
            thinking: 'Primary: The geyser element is burnt out.',
            image_descriptions: ['Water on the floor.'],
        };
        const result = reportThoughtsParagraph(diagnosis, 'Old desc');
        expect(result).toContain('element');
        expect(result).not.toContain('Old desc');
    });
});

// ── diagnosisSectionsDuplicate ────────────────────────────────────────────────

describe('diagnosisSectionsDuplicate', () => {
    it('returns true when message and action are identical', () => {
        const text = 'Replace the geyser element immediately.';
        expect(diagnosisSectionsDuplicate(text, text)).toBe(true);
    });

    it('returns true when they match after normalisation (whitespace differences)', () => {
        expect(
            diagnosisSectionsDuplicate(
                'Replace  the geyser  element.',
                'Replace the geyser element.',
            ),
        ).toBe(true);
    });

    it('returns false when message and action differ', () => {
        expect(
            diagnosisSectionsDuplicate(
                'The geyser is leaking.',
                'Call a plumber to inspect the geyser.',
            ),
        ).toBe(false);
    });

    it('returns false when either value is null', () => {
        expect(diagnosisSectionsDuplicate(null, 'some action')).toBe(false);
        expect(diagnosisSectionsDuplicate('some message', null)).toBe(false);
    });

    it('returns false when either value is empty', () => {
        expect(diagnosisSectionsDuplicate('', 'some action')).toBe(false);
        expect(diagnosisSectionsDuplicate('some message', '')).toBe(false);
    });
});
