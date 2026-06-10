import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generateContent = vi.fn();

vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => ({ models: { generateContent } }),
}));

import { classifyIntent } from '../intent-classifier';
import type { ParserOption } from '../forgiving-parser';

const OPTIONS: ParserOption[] = [
    { index: 1, text: 'Too heavy to lift' },
    { index: 2, text: 'Lifts but drops fast' },
];

const savedKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
    generateContent.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
});

describe('classifyIntent', () => {
    it('returns null and does not call the model when GEMINI_API_KEY is absent', async () => {
        delete process.env.GEMINI_API_KEY;
        const res = await classifyIntent('the first one', OPTIONS);
        expect(res).toBeNull();
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns null when there are no options', async () => {
        const res = await classifyIntent('anything', []);
        expect(res).toBeNull();
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('maps a reply to the matched option index parsed from the model text', async () => {
        generateContent.mockResolvedValue({ text: '2' });
        const res = await classifyIntent('it drops fast', OPTIONS);
        expect(res).toBe(2);
    });

    it('returns null when the model answers 0 (no clear match)', async () => {
        generateContent.mockResolvedValue({ text: '0' });
        const res = await classifyIntent('no idea', OPTIONS);
        expect(res).toBeNull();
    });

    it('returns null when the model returns an out-of-range index', async () => {
        generateContent.mockResolvedValue({ text: '9' });
        const res = await classifyIntent('???', OPTIONS);
        expect(res).toBeNull();
    });

    it('returns null on a model error (never throws)', async () => {
        generateContent.mockRejectedValue(new Error('model down'));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await classifyIntent('heavy', OPTIONS);
        expect(res).toBeNull();
        warnSpy.mockRestore();
    });

    it('caches a result so a repeated identical reply does not re-call the model', async () => {
        generateContent.mockResolvedValue({ text: '1' });
        const uniqueOptions: ParserOption[] = [
            { index: 1, text: `cache-${Math.random()}` },
            { index: 2, text: 'other' },
        ];
        const first = await classifyIntent('pick the first', uniqueOptions);
        const second = await classifyIntent('pick the first', uniqueOptions);
        expect(first).toBe(1);
        expect(second).toBe(1);
        expect(generateContent).toHaveBeenCalledTimes(1);
    });
});
