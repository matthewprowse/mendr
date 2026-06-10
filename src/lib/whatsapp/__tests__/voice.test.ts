import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generateContent = vi.fn();

vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => ({ models: { generateContent } }),
}));

import { transcribeVoiceNote } from '../voice';

const savedKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
    generateContent.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
});

const bytes = new Uint8Array([1, 2, 3, 4]);

describe('transcribeVoiceNote', () => {
    it('returns null and skips the model when GEMINI_API_KEY is missing', async () => {
        delete process.env.GEMINI_API_KEY;
        expect(await transcribeVoiceNote(bytes, 'audio/ogg')).toBeNull();
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns null for empty audio without calling the model', async () => {
        expect(await transcribeVoiceNote(new Uint8Array(0), 'audio/ogg')).toBeNull();
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns null for audio exceeding the max size', async () => {
        const huge = new Uint8Array(11 * 1024 * 1024);
        expect(await transcribeVoiceNote(huge, 'audio/ogg')).toBeNull();
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns the trimmed transcript text on success', async () => {
        generateContent.mockResolvedValue({ text: '  my geyser is leaking  ' });
        const res = await transcribeVoiceNote(bytes, 'audio/ogg; codecs=opus');
        expect(res).toBe('my geyser is leaking');
        // mime type is normalised (param stripped) and base64 inline data sent.
        const call = generateContent.mock.calls[0][0];
        const inlinePart = call.contents[0].parts.find(
            (p: { inlineData?: { mimeType?: string } }) => p.inlineData,
        );
        expect(inlinePart.inlineData.mimeType).toBe('audio/ogg');
        expect(typeof inlinePart.inlineData.data).toBe('string');
    });

    it('returns null when the transcript is empty', async () => {
        generateContent.mockResolvedValue({ text: '   ' });
        expect(await transcribeVoiceNote(bytes, 'audio/ogg')).toBeNull();
    });

    it('returns null on a transcription error', async () => {
        generateContent.mockRejectedValue(new Error('model down'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await transcribeVoiceNote(bytes, 'audio/ogg')).toBeNull();
        errSpy.mockRestore();
    });
});
