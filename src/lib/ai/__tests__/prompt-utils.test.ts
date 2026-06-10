/**
 * Unit tests for prompt-utils.ts — pure prompt post-processing utilities.
 *
 * Covers:
 *   - toHeadlineStyle: empty input, minor-word rule, first/last word never lowercased,
 *     unknown words are capitalised.
 *   - stripFillerSentenceStarts: A/An/The/This/It/There stripping, empty output guard,
 *     multi-sentence inputs, inputs with no filler starts (no-op path).
 */

import { describe, it, expect } from 'vitest';
import { toHeadlineStyle, stripFillerSentenceStarts } from '../prompt-utils';

// ---------------------------------------------------------------------------
// toHeadlineStyle
// ---------------------------------------------------------------------------

describe('toHeadlineStyle', () => {
    it('returns empty string for empty input', () => {
        expect(toHeadlineStyle('')).toBe('');
        expect(toHeadlineStyle('   ')).toBe('');
    });

    it('capitalises a single word', () => {
        expect(toHeadlineStyle('geyser')).toBe('Geyser');
    });

    it('lowercases minor connector words in the middle of a phrase', () => {
        const result = toHeadlineStyle('Leaking Pipe and Water Damage');
        expect(result).toBe('Leaking Pipe and Water Damage');
    });

    it('always capitalises the first word even if it is a minor word', () => {
        const result = toHeadlineStyle('the geyser is leaking');
        expect(result.startsWith('The')).toBe(true);
    });

    it('always capitalises the last word even if it is a minor word', () => {
        const result = toHeadlineStyle('geyser is leaking in the');
        expect(result.endsWith('The')).toBe(true);
    });

    it('handles multiple spaces between words', () => {
        const result = toHeadlineStyle('burst   pipe   repair');
        expect(result).toBe('Burst Pipe Repair');
    });

    it('lowercases "of", "or", "for", "to", "at", "on", "in" in the middle', () => {
        const phrase = 'cost of repair at home or office for the client on the job in time to etc.';
        const result = toHeadlineStyle(phrase);
        // all these minor words except first/last should be lowercase
        expect(result).toContain(' of ');
        expect(result).toContain(' at ');
        expect(result).toContain(' or ');
        expect(result).toContain(' for ');
        expect(result).toContain(' to ');
        expect(result).toContain(' on ');
        expect(result).toContain(' in ');
    });
});

// ---------------------------------------------------------------------------
// stripFillerSentenceStarts
// ---------------------------------------------------------------------------

describe('stripFillerSentenceStarts', () => {
    it('strips "A " from the start of the first sentence', () => {
        const result = stripFillerSentenceStarts('A leaking geyser is dangerous.');
        expect(result.startsWith('Leaking')).toBe(true);
    });

    it('strips "An " from the start of the first sentence', () => {
        const result = stripFillerSentenceStarts('An electrical fault was found.');
        expect(result.startsWith('Electrical')).toBe(true);
    });

    it('strips "The " from the start of a sentence', () => {
        const result = stripFillerSentenceStarts('The geyser needs replacing.');
        expect(result.startsWith('Geyser')).toBe(true);
    });

    it('strips "This " from the start of a sentence', () => {
        const result = stripFillerSentenceStarts('This indicates a serious fault.');
        expect(result.startsWith('Indicates')).toBe(true);
    });

    it('strips "It " from the start of a sentence', () => {
        const result = stripFillerSentenceStarts('It is likely a pressure valve issue.');
        expect(result.startsWith('Is')).toBe(true);
    });

    it('strips "There " from the start of a sentence', () => {
        const result = stripFillerSentenceStarts('There is a burst pipe in the wall.');
        expect(result.startsWith('Is')).toBe(true);
    });

    it('handles multi-sentence inputs, stripping each filler opener', () => {
        const input = 'A leak was detected. The pipe is corroded. It should be replaced.';
        const result = stripFillerSentenceStarts(input);
        expect(result).not.toMatch(/^A /);
        expect(result).not.toContain('The pipe');
        expect(result).not.toContain('It should');
    });

    it('does not modify sentences that do not start with a filler word', () => {
        const input = 'Burst pipes require immediate attention. Call a plumber now.';
        const result = stripFillerSentenceStarts(input);
        expect(result).toContain('Burst pipes');
        expect(result).toContain('Call a plumber');
    });

    it('returns the original sentence when stripping leaves empty string', () => {
        // If the filler pattern matches the entire sentence the guard returns the
        // original rather than an empty string.
        const input = 'It.';
        const result = stripFillerSentenceStarts(input);
        // Must not be empty
        expect(result.length).toBeGreaterThan(0);
    });

    it('handles empty string input gracefully', () => {
        expect(stripFillerSentenceStarts('')).toBe('');
    });
});
