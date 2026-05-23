import { describe, it, expect } from 'vitest';
import { detectHedging, isProseExcessivelyHedging } from '../hedging-guard';

describe('detectHedging', () => {
    it('returns excessive=false for an empty input', () => {
        const result = detectHedging('');
        expect(result.excessive).toBe(false);
        expect(result.hits).toBe(0);
    });

    it('returns excessive=false for null/undefined', () => {
        expect(detectHedging(null).excessive).toBe(false);
        expect(detectHedging(undefined).excessive).toBe(false);
    });

    it('returns excessive=false for a confident diagnosis', () => {
        const text =
            'The lift spring is missing from the left bracket. The door is dead weight without it. Replace the spring assembly.';
        const result = detectHedging(text);
        expect(result.excessive).toBe(false);
        expect(result.hits).toBe(0);
    });

    it('flags excessive when a single STRONG pattern hits in a short text', () => {
        const text = 'It is difficult to tell from this photo. The image is dark.';
        const result = detectHedging(text);
        expect(result.strongHits).toBeGreaterThanOrEqual(1);
        expect(result.excessive).toBe(true);
    });

    it('flags excessive when "without more information" appears', () => {
        const text = 'The fitting looks intact. Without more information we cannot confirm.';
        const result = detectHedging(text);
        expect(result.excessive).toBe(true);
    });

    it('flags excessive on density (≥0.5 hedging hits per sentence)', () => {
        const text =
            'This appears to be a leak. It might be a worn seal. Perhaps the gasket failed.';
        const result = detectHedging(text);
        expect(result.density).toBeGreaterThanOrEqual(0.5);
        expect(result.excessive).toBe(true);
    });

    it('flags excessive when three distinct patterns hit, even in a long text', () => {
        const text =
            'The unit appears to be functional overall. It might require service. The compressor may be failing. There is no visible damage. The wiring looks intact. The casing has no cracks. The mount is solid. Possibly something internal has worn out.';
        const result = detectHedging(text);
        expect(result.hits).toBeGreaterThanOrEqual(3);
        expect(result.excessive).toBe(true);
    });

    it('does NOT flag excessive when a single mild hedge appears in a confident diagnosis', () => {
        const text =
            'The geyser element is burnt out — visible scorching at the contact. Possibly worth checking the thermostat as well. Replace the element. Test for continuity before refilling.';
        const result = detectHedging(text);
        expect(result.hits).toBe(1);
        expect(result.excessive).toBe(false);
    });

    it('captures the first matched sample', () => {
        const text = 'It is difficult to tell from this photo.';
        const result = detectHedging(text);
        expect(result.sample.toLowerCase()).toContain('difficult to tell');
    });

    it('handles short single-sentence text gracefully', () => {
        const text = 'Leak.';
        const result = detectHedging(text);
        expect(result.sentences).toBe(1);
        expect(result.excessive).toBe(false);
    });

    it('is case-insensitive', () => {
        const text = 'IT IS DIFFICULT TO TELL. UNABLE TO CONFIRM.';
        const result = detectHedging(text);
        expect(result.excessive).toBe(true);
    });
});

describe('isProseExcessivelyHedging', () => {
    it('combines thought + diagnosis + message and detects hedging across fields', () => {
        const result = isProseExcessivelyHedging({
            thought: 'The component appears to be intact.',
            diagnosis: 'It might be a sealing issue.',
            message: 'We cannot tell from this angle.',
        });
        expect(result).toBe(true);
    });

    it('returns false when none of the fields hedge', () => {
        const result = isProseExcessivelyHedging({
            thought: 'The lift spring is absent from the left bracket.',
            diagnosis: 'Missing garage door spring.',
            message: 'Replace the spring assembly.',
        });
        expect(result).toBe(false);
    });

    it('handles undefined fields without throwing', () => {
        const result = isProseExcessivelyHedging({});
        expect(result).toBe(false);
    });
});
