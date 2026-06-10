import { describe, it, expect } from 'vitest';
import {
    detectNonEnglishGreeting,
    matchOptionExact,
    looksConfusedOrFrustrated,
    type ParserOption,
} from '../forgiving-parser';

const OPTIONS: ParserOption[] = [
    { index: 1, text: 'Heavy gate' },
    { index: 2, text: 'Drops fast' },
    { index: 3, text: 'Something else' },
];

describe('detectNonEnglishGreeting', () => {
    it('detects Afrikaans greetings', () => {
        expect(detectNonEnglishGreeting('Goeie more')).toBe(true);
        expect(detectNonEnglishGreeting('dankie')).toBe(true);
    });
    it('detects isiXhosa / isiZulu greetings', () => {
        expect(detectNonEnglishGreeting('molo')).toBe(true);
        expect(detectNonEnglishGreeting('sawubona')).toBe(true);
    });
    it('returns false for English text', () => {
        expect(detectNonEnglishGreeting('my geyser is leaking')).toBe(false);
    });
    it('returns false for empty input', () => {
        expect(detectNonEnglishGreeting('')).toBe(false);
    });
    it('returns false for very long messages (> 60 chars)', () => {
        expect(detectNonEnglishGreeting('molo ' + 'x'.repeat(70))).toBe(false);
    });
});

describe('matchOptionExact — edge branches', () => {
    it('does not match when two number tokens are present', () => {
        expect(matchOptionExact('1 or 2', OPTIONS)).toBeNull();
    });
    it('honours a short ordinal-only reply with filler words', () => {
        // <= 3 words and only ordinal + filler ("please") remain.
        expect(matchOptionExact('second please', OPTIONS)).toBe(2);
    });
    it('does not honour an ordinal reply longer than three words', () => {
        // "the second one please" is 4 words, exceeding the short-reply guard.
        expect(matchOptionExact('the second one please', OPTIONS)).toBeNull();
    });
    it('ignores an ordinal embedded in a long sentence', () => {
        expect(
            matchOptionExact('ya the first thing i noticed was the noise', OPTIONS),
        ).toBeNull();
    });
    it('returns null for an empty options list', () => {
        expect(matchOptionExact('1', [])).toBeNull();
    });
    it('returns null for whitespace-only input', () => {
        expect(matchOptionExact('   ', OPTIONS)).toBeNull();
    });
    it('does not match a too-short partial (< 4 chars)', () => {
        expect(matchOptionExact('hea', OPTIONS)).toBeNull();
    });
});

describe('looksConfusedOrFrustrated — extra signals', () => {
    it('treats punctuation-only replies as confused', () => {
        expect(looksConfusedOrFrustrated('??')).toBe(true);
    });
    it('detects "makes no sense"', () => {
        expect(looksConfusedOrFrustrated('this makes no sense')).toBe(true);
    });
});
