/**
 * Tests for the image-relevance gateway.
 *
 * The gateway has two paths we must lock down:
 *
 *   1. MOCK_LLM short-circuit — must return relevant=true without touching
 *      the Gemini SDK (which would throw without an API key).
 *   2. Fail-open contract — any throw inside the live call path must yield
 *      relevant=true so a gateway outage cannot block a real diagnosis.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('checkImageRelevance — MOCK_LLM branch', () => {
    const original = process.env.MOCK_LLM;

    beforeEach(() => {
        process.env.MOCK_LLM = '1';
    });

    afterEach(() => {
        if (original === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = original;
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('returns relevant=true with high confidence without calling Gemini', async () => {
        // No GEMINI_API_KEY → if the real SDK code were reached, getGeminiModelNamed
        // would throw. Reaching the assertion below proves the mock path took over.
        const prevKey = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        try {
            const { checkImageRelevance } = await import('../image-relevance-gateway');
            const result = await checkImageRelevance(
                ['https://example.com/photo.jpg'],
                'my geyser is leaking',
            );
            expect(result.relevant).toBe(true);
            expect(result.confidence).toBeGreaterThanOrEqual(90);
            expect(result.tokensUsed.promptTokens).toBe(0);
            expect(result.tokensUsed.completionTokens).toBe(0);
        } finally {
            if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
        }
    });

    it('returns relevant=true even with no images or text in mock mode', async () => {
        const { checkImageRelevance } = await import('../image-relevance-gateway');
        const result = await checkImageRelevance([], null);
        expect(result.relevant).toBe(true);
    });
});

describe('checkImageRelevance — fail-open on errors', () => {
    const originalMock = process.env.MOCK_LLM;
    const originalKey = process.env.GEMINI_API_KEY;

    beforeEach(() => {
        delete process.env.MOCK_LLM;
        vi.resetModules();
    });

    afterEach(() => {
        if (originalMock === undefined) delete process.env.MOCK_LLM;
        else process.env.MOCK_LLM = originalMock;
        if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalKey;
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('returns relevant=true with confidence 50 when the model throws', async () => {
        // Force the Gemini SDK to throw the moment we try to build a model.
        vi.doMock('@/lib/ai/ai-client', () => ({
            getGeminiModelNamed: () => {
                throw new Error('simulated SDK failure');
            },
        }));
        // Stub the image loader to return a usable inlineData so we get past
        // the "no input" short-circuit and into the try/catch that fail-opens.
        vi.doMock('@/app/api/diagnose/image-loader', () => ({
            imageStringToInlineData: async () => ({
                inlineData: { data: 'AAA=', mimeType: 'image/jpeg' },
            }),
        }));
        const { checkImageRelevance } = await import('../image-relevance-gateway');
        const result = await checkImageRelevance(
            ['https://example.com/photo.jpg'],
            null,
        );
        expect(result.relevant).toBe(true);
        expect(result.confidence).toBe(50);
    });

    it('returns relevant=true with confidence 50 when there is no input at all (degenerate)', async () => {
        // With no MOCK_LLM, no images, and no text, the gateway should
        // short-circuit to a fail-open relevant verdict rather than calling
        // the model with nothing.
        vi.doMock('@/app/api/diagnose/image-loader', () => ({
            imageStringToInlineData: async () => null,
        }));
        const { checkImageRelevance } = await import('../image-relevance-gateway');
        const result = await checkImageRelevance([], null);
        expect(result.relevant).toBe(true);
        expect(result.confidence).toBe(50);
    });
});
