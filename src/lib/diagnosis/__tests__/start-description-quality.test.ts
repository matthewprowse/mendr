import { describe, it, expect } from 'vitest';
import {
    assessStartDescription,
    START_DESCRIPTION_MIN_CHARS,
} from '../start-description-quality';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectOk(input: string) {
    const result = assessStartDescription(input);
    if (!result.ok) {
        throw new Error(
            `Expected assessment OK but got: ${result.message} (input: ${JSON.stringify(input)})`,
        );
    }
    expect(result.ok).toBe(true);
}

function expectReject(input: string, fragment?: string | RegExp) {
    const result = assessStartDescription(input);
    expect(result.ok).toBe(false);
    if (!result.ok && fragment !== undefined) {
        if (typeof fragment === 'string') {
            expect(result.message).toContain(fragment);
        } else {
            expect(result.message).toMatch(fragment);
        }
    }
}

// ---------------------------------------------------------------------------
// Length gates
// ---------------------------------------------------------------------------

describe('assessStartDescription — length', () => {
    it('exports a minimum-character constant', () => {
        expect(START_DESCRIPTION_MIN_CHARS).toBe(25);
    });

    it('rejects an empty string', () => {
        expectReject('', /at least 25 characters/);
    });

    it('rejects whitespace-only input', () => {
        expectReject('     \t   \n   ', /at least 25 characters/);
    });

    it('rejects a string just below the minimum length', () => {
        expectReject('Geyser leak', /at least 25 characters/);
    });

    it('accepts a clear, just-over-minimum description', () => {
        expectOk('Geyser leaking water from ceiling onto bedroom floor');
    });

    it('rejects a string exceeding the max length cap', () => {
        const huge = 'a'.repeat(4001);
        expectReject(huge, /too long/);
    });
});

// ---------------------------------------------------------------------------
// Letter content / ratio gates
// ---------------------------------------------------------------------------

describe('assessStartDescription — letter content', () => {
    it('rejects a 25-char string with too few letters', () => {
        // 25 characters, almost all digits and symbols
        expectReject('1234567890!@#$%^&*()12345', /ordinary words/);
    });

    it('rejects when letter ratio is below threshold', () => {
        // Letters but mostly punctuation/digits — 18+ letters, lots of symbols.
        // The exact rejection branch (ratio vs. word-count vs. symbol-variety)
        // depends on ordering; we only care that the gate fires.
        expectReject('aaaaaaaaaaaaaaaaaa!@#$%^&*()1234567890+=');
    });

    it('accepts a paragraph dominated by letters', () => {
        expectOk('The kitchen tap is dripping constantly even when fully closed.');
    });
});

// ---------------------------------------------------------------------------
// Word-count gates
// ---------------------------------------------------------------------------

describe('assessStartDescription — substantive words', () => {
    it('rejects when fewer than 5 substantive words', () => {
        // 25+ chars, plenty letters, but only single-letter "words"
        // Build a long string with single letters separated by spaces.
        const input = 'a b c d e f g h i j k l m n o p q r s t u v w x y';
        expectReject(input, /short sentence/);
    });

    it('accepts five-plus substantive words', () => {
        expectOk('Geyser leaking water onto bedroom ceiling slowly');
    });

    it('rejects when the same word is repeated many times', () => {
        // 8+ substantive words but only ≤2 unique
        expectReject(
            'broken broken broken broken broken broken broken broken broken',
            /own words/,
        );
    });
});

// ---------------------------------------------------------------------------
// Symbol-spam / punctuation runs
// ---------------------------------------------------------------------------

describe('assessStartDescription — symbol spam', () => {
    it('rejects long dot-runs embedded in text', () => {
        expectReject(
            'pipe..........leak broken plumbing leaking water bath now',
            /dot or dash runs/,
        );
    });

    it('rejects long underscore-runs', () => {
        expectReject(
            'kitchen_______________sink leaking onto floor today plumber',
            /dot or dash runs/,
        );
    });

    it('rejects a 15-character repeated single char', () => {
        expectReject(
            'aaaaaaaaaaaaaaaaaa my geyser is broken now please help me out',
            /long repeated characters/,
        );
    });

    it('rejects a high-variety symbol soup with low letter ratio', () => {
        // Many unique symbols / low letter ratio — earlier-gate rejection
        // is fine; we only care the assessment fails.
        expectReject('pipe!@#$%^&*()_+={}[]|:;"<>,.?/~`broken plumbing');
    });

    it('rejects input that is purely punctuation/whitespace after stripping digits', () => {
        // Earlier gate (letter count) will likely fire — still a rejection.
        expectReject('..,,..,,..,,..,,..,,..,,..,,..,, 11111 22222 33333');
    });
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe('assessStartDescription — passes for real-world inputs', () => {
    it('accepts a typical homeowner description', () => {
        expectOk(
            'My geyser has been leaking water onto the bathroom ceiling for two days now, and the pressure seems low.',
        );
    });

    it('accepts a short but descriptive sentence', () => {
        expectOk('Kitchen sink tap dripping every couple of seconds.');
    });

    it('accepts text with mixed punctuation and numbers', () => {
        expectOk(
            'Power to the kitchen tripped at 03:00 last night and the trip switch will not reset.',
        );
    });
});
