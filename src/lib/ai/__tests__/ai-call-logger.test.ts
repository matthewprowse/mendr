/**
 * Tests for the ai_call_log writer.
 *
 * `textifyGeminiContents` is a pure serialiser that flattens a Gemini
 * `Content[]` to a storable text blob WITHOUT ever inlining image bytes — the
 * privacy-critical property. `logAiCall` is fire-and-forget; we pin the
 * disable flag and the `after()` scheduling path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Content as GeminiContent } from '@google/genai';

const afterMock = vi.fn((cb: () => void) => cb());
vi.mock('next/server', () => ({
    after: (cb: () => void) => afterMock(cb),
}));

const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: () => ({ insert: insertMock }),
    })),
}));

import { textifyGeminiContents, logAiCall } from '../ai-call-logger';

describe('textifyGeminiContents', () => {
    it('leads with the system-instruction block', () => {
        const out = textifyGeminiContents('be a plumber', []);
        expect(out.startsWith('=== SYSTEM INSTRUCTION ===\nbe a plumber')).toBe(true);
    });

    it('labels each content with its index and role and includes text parts', () => {
        const contents = [
            { role: 'user', parts: [{ text: 'my geyser leaks' }] },
            { role: 'model', parts: [{ text: 'likely a valve' }] },
        ] as unknown as GeminiContent[];
        const out = textifyGeminiContents('sys', contents);
        expect(out).toContain('=== CONTENT[0] role=user ===');
        expect(out).toContain('my geyser leaks');
        expect(out).toContain('=== CONTENT[1] role=model ===');
        expect(out).toContain('likely a valve');
    });

    it('replaces inline image data with a marker — bytes are never logged', () => {
        const contents = [
            {
                role: 'user',
                parts: [
                    { text: 'see photo' },
                    { inlineData: { mimeType: 'image/jpeg', data: 'AAAABBBBCCCC' } },
                ],
            },
        ] as unknown as GeminiContent[];
        const out = textifyGeminiContents('sys', contents);
        expect(out).toContain('[INLINE image/jpeg — bytes not logged]');
        expect(out).not.toContain('AAAABBBBCCCC');
    });

    it('renders fileData parts as a URI marker', () => {
        const contents = [
            {
                role: 'user',
                parts: [{ fileData: { mimeType: 'image/png', fileUri: 'gs://bucket/x.png' } }],
            },
        ] as unknown as GeminiContent[];
        const out = textifyGeminiContents('sys', contents);
        expect(out).toContain('[FILE image/png gs://bucket/x.png]');
    });

    it('marks unknown part shapes without throwing', () => {
        const contents = [
            { role: 'user', parts: [{ somethingElse: true } as unknown] },
        ] as unknown as GeminiContent[];
        const out = textifyGeminiContents('sys', contents);
        expect(out).toContain('[unknown part type]');
    });
});

describe('logAiCall', () => {
    beforeEach(() => {
        afterMock.mockClear();
        insertMock.mockClear();
        delete process.env.AI_CALL_LOG_DISABLED;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const input = {
        conversationId: 'conv-1',
        agentId: '2a' as const,
        promptText: 'prompt',
        modelId: 'gemini-2.5-flash',
    };

    it('does nothing when AI_CALL_LOG_DISABLED=1', () => {
        process.env.AI_CALL_LOG_DISABLED = '1';
        logAiCall(input);
        expect(afterMock).not.toHaveBeenCalled();
    });

    it('schedules the insert via after() when logging is enabled', async () => {
        logAiCall(input);
        expect(afterMock).toHaveBeenCalledTimes(1);
        // afterMock runs the callback synchronously in this test; let the
        // scheduled insert promise settle.
        await Promise.resolve();
        await Promise.resolve();
        expect(insertMock).toHaveBeenCalledTimes(1);
        const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
        expect(row.conversation_id).toBe('conv-1');
        expect(row.agent_id).toBe('2a');
        expect(row.model_id).toBe('gemini-2.5-flash');
        // imageUrls defaults to [] when not provided.
        expect(row.image_urls).toEqual([]);
    });

    it('passes imageUrls array through to the db row', async () => {
        logAiCall({ ...input, imageUrls: ['https://storage.example.com/img1.jpg', 'https://storage.example.com/img2.jpg'] });
        await Promise.resolve();
        await Promise.resolve();
        expect(insertMock).toHaveBeenCalledTimes(1);
        const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
        expect(row.image_urls).toEqual(['https://storage.example.com/img1.jpg', 'https://storage.example.com/img2.jpg']);
    });

    it('stores null imageUrls as an empty array', async () => {
        logAiCall({ ...input, imageUrls: null });
        await Promise.resolve();
        await Promise.resolve();
        const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
        expect(row.image_urls).toEqual([]);
    });

    it('logs a warning when the insert returns an error', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        insertMock.mockResolvedValueOnce({ error: { message: 'insert failed' } } as never);
        logAiCall(input);
        await Promise.resolve();
        await Promise.resolve();
        expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('insert error'))).toBe(true);
        warnSpy.mockRestore();
    });

    it('falls back to fire-and-forget when after() throws', async () => {
        afterMock.mockImplementationOnce(() => { throw new Error('not in request scope'); });
        // Should not throw
        expect(() => logAiCall(input)).not.toThrow();
        // The fallback void path still fires the insert
        await Promise.resolve();
        await Promise.resolve();
        expect(insertMock).toHaveBeenCalledTimes(1);
    });
});
