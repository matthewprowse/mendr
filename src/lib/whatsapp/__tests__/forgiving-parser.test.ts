import { describe, it, expect, vi } from 'vitest';
import {
    detectGlobalCommand,
    detectYesNo,
    matchOptionExact,
    resolveOption,
    resolveYesNo,
    looksLikeQuestion,
    looksConfusedOrFrustrated,
    type ParserOption,
} from '../forgiving-parser';

const OPTIONS: ParserOption[] = [
    { index: 1, text: 'The door is too heavy to lift manually' },
    { index: 2, text: 'The door lifts but drops quickly' },
    { index: 3, text: 'Something else is happening' },
];

describe('detectGlobalCommand', () => {
    it('matches help / menu', () => {
        expect(detectGlobalCommand('help')).toBe('help');
        expect(detectGlobalCommand('Menu')).toBe('menu');
        expect(detectGlobalCommand('what can you do')).toBe('help');
    });
    it('matches start over variants', () => {
        expect(detectGlobalCommand('start over')).toBe('start_over');
        expect(detectGlobalCommand('restart')).toBe('start_over');
        expect(detectGlobalCommand('start again')).toBe('start_over');
    });
    it('matches stop and human escape', () => {
        expect(detectGlobalCommand('stop')).toBe('stop');
        expect(detectGlobalCommand('talk to a person')).toBe('human');
        expect(detectGlobalCommand('I want to speak to someone')).toBe('human');
    });
    it('returns null for ordinary replies', () => {
        expect(detectGlobalCommand('the first one')).toBeNull();
        expect(detectGlobalCommand('yes')).toBeNull();
    });
});

describe('detectYesNo (layer 1)', () => {
    it('handles common yes variants', () => {
        for (const y of ['yes', 'Yeah', 'ya', 'sure', 'ok', 'please']) {
            expect(detectYesNo(y)).toBe('yes');
        }
    });
    it('handles common no variants', () => {
        for (const n of ['no', 'nope', 'nah', 'no thanks']) {
            expect(detectYesNo(n)).toBe('no');
        }
    });
    it('matches leading token for short phrases', () => {
        expect(detectYesNo('yes please find them')).toBe('yes');
        expect(detectYesNo('no thank you')).toBe('no');
    });
    it('returns unclear for ambiguous replies', () => {
        expect(detectYesNo('maybe later')).toBe('unclear');
        expect(detectYesNo('what do you mean')).toBe('unclear');
    });
});

describe('matchOptionExact (layer 1)', () => {
    it('matches a bare number', () => {
        expect(matchOptionExact('2', OPTIONS)).toBe(2);
    });
    it('matches ordinal words', () => {
        expect(matchOptionExact('the first one', OPTIONS)).toBe(1);
        expect(matchOptionExact('second', OPTIONS)).toBe(2);
    });
    it('matches "last"', () => {
        expect(matchOptionExact('the last one', OPTIONS)).toBe(3);
    });
    it('matches exact option text', () => {
        expect(matchOptionExact('The door lifts but drops quickly', OPTIONS)).toBe(2);
    });
    it('matches a clear partial', () => {
        expect(matchOptionExact('too heavy to lift', OPTIONS)).toBe(1);
    });
    it('returns null for an out-of-range number', () => {
        expect(matchOptionExact('9', OPTIONS)).toBeNull();
    });
    it('returns null for gibberish', () => {
        expect(matchOptionExact('asdkjh', OPTIONS)).toBeNull();
    });
    it('does not match when multiple options contain the reply', () => {
        // "the door" appears in options 1 and 2 → ambiguous, no exact match.
        expect(matchOptionExact('the door', OPTIONS)).toBeNull();
    });
});

describe('resolveOption (layers 1+2)', () => {
    it('resolves via layer 1 without calling the classifier', async () => {
        const classifier = vi.fn();
        const res = await resolveOption('2', OPTIONS, classifier);
        expect(res).toEqual({ kind: 'option', index: 2 });
        expect(classifier).not.toHaveBeenCalled();
    });
    it('falls back to the classifier when layer 1 fails', async () => {
        const classifier = vi.fn().mockResolvedValue(1);
        const res = await resolveOption('ya the heavy gate one', OPTIONS, classifier);
        expect(res).toEqual({ kind: 'option', index: 1 });
        expect(classifier).toHaveBeenCalledOnce();
    });
    it('returns unclear when the classifier says unclear', async () => {
        const classifier = vi.fn().mockResolvedValue(null);
        const res = await resolveOption('hmmm', OPTIONS, classifier);
        expect(res).toEqual({ kind: 'unclear' });
    });
    it('never throws when the classifier rejects', async () => {
        const classifier = vi.fn().mockRejectedValue(new Error('boom'));
        const res = await resolveOption('???', OPTIONS, classifier);
        expect(res).toEqual({ kind: 'unclear' });
    });
    it('ignores a classifier index that is out of range', async () => {
        const classifier = vi.fn().mockResolvedValue(99);
        const res = await resolveOption('mystery', OPTIONS, classifier);
        expect(res).toEqual({ kind: 'unclear' });
    });
});

describe('resolveYesNo (layers 1+2)', () => {
    it('resolves layer 1 without the classifier', async () => {
        const classifier = vi.fn();
        expect(await resolveYesNo('yes', classifier)).toBe('yes');
        expect(classifier).not.toHaveBeenCalled();
    });
    it('uses the classifier for ambiguous yes', async () => {
        const classifier = vi.fn().mockResolvedValue(1);
        expect(await resolveYesNo('go on then', classifier)).toBe('yes');
    });
    it('uses the classifier for ambiguous no', async () => {
        const classifier = vi.fn().mockResolvedValue(2);
        expect(await resolveYesNo('rather not', classifier)).toBe('no');
    });
    it('returns unclear when nothing maps', async () => {
        const classifier = vi.fn().mockResolvedValue(null);
        expect(await resolveYesNo('what is this', classifier)).toBe('unclear');
    });
});

describe('looksLikeQuestion', () => {
    it('detects trailing question mark', () => {
        expect(looksLikeQuestion('do I have to pay')).toBe(true);
        expect(looksLikeQuestion('what do you mean?')).toBe(true);
    });
    it('detects question lead words', () => {
        expect(looksLikeQuestion('how much will it cost')).toBe(true);
    });
    it('returns false for an answer', () => {
        expect(looksLikeQuestion('the first one')).toBe(false);
    });
});

describe('looksConfusedOrFrustrated', () => {
    it('detects blunt confusion', () => {
        expect(looksConfusedOrFrustrated('huh')).toBe(true);
        expect(looksConfusedOrFrustrated('this is wrong')).toBe(true);
        expect(looksConfusedOrFrustrated('I dont understand')).toBe(true);
    });
    it('treats empty / sticker-only as confused', () => {
        expect(looksConfusedOrFrustrated('')).toBe(true);
        expect(looksConfusedOrFrustrated('🙂')).toBe(true);
    });
    it('returns false for a normal answer', () => {
        expect(looksConfusedOrFrustrated('the second option')).toBe(false);
    });
});
