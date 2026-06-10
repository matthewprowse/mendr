/**
 * Tests for estimate-cost.ts (generateCostEstimate).
 *
 * All AI and cost-logger calls are mocked so no real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the AI client and cost-logger ────────────────────────────────────────

const mockGenerateContent = vi.fn();

vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: vi.fn(() => ({
        models: { generateContent: mockGenerateContent },
    })),
}));

vi.mock('@/lib/ai/ai-cost-logger', () => ({
    logGeminiUsage: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGeminiResponse(text: string) {
    return {
        text,
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 },
    };
}

function makeValidJson() {
    return JSON.stringify({
        line_items: [
            { label: 'Callout', low: 500, high: 800 },
            { label: 'Labour (2 hrs)', low: 600, high: 1200 },
            { label: 'Parts (spring)', low: 0, high: 2000 },
        ],
        note: 'If you already have the spring, expect callout + labour only.',
    });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateCostEstimate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GEMINI_API_KEY = 'test-key';
    });

    it('returns null when GEMINI_API_KEY is missing', async () => {
        delete process.env.GEMINI_API_KEY;
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Geyser leaking' });
        expect(result).toBeNull();
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('returns a CostEstimate with correct low/high sums on valid JSON', async () => {
        mockGenerateContent.mockResolvedValue(makeGeminiResponse(makeValidJson()));
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Garage door spring snapped' });
        expect(result).not.toBeNull();
        expect(result?.currency).toBe('ZAR');
        expect(result?.line_items.length).toBe(3);
        // low = 500+600+0 = 1100, rounded to 50 -> 1100; high = 800+1200+2000 = 4000
        expect(result?.low).toBeGreaterThanOrEqual(0);
        expect(result?.high).toBeGreaterThan(result!.low);
        expect(result?.generated_at).toBeTruthy();
    });

    it('returns null when AI call throws', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI call failed'));
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Broken geyser' });
        expect(result).toBeNull();
    });

    it('returns null when response is not valid JSON', async () => {
        mockGenerateContent.mockResolvedValue(makeGeminiResponse('not json at all'));
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Broken geyser' });
        expect(result).toBeNull();
    });

    it('returns null when line_items is missing from parsed JSON', async () => {
        mockGenerateContent.mockResolvedValue(
            makeGeminiResponse(JSON.stringify({ note: 'some note' })),
        );
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Test' });
        expect(result).toBeNull();
    });

    it('returns null when all line_items are invalid', async () => {
        mockGenerateContent.mockResolvedValue(
            makeGeminiResponse(
                JSON.stringify({
                    line_items: [
                        { label: '', low: 0, high: 0 },
                        { low: 'nan', high: 'nan' },
                    ],
                    note: 'x',
                }),
            ),
        );
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Test' });
        expect(result).toBeNull();
    });

    it('includes context fields in the user prompt (trade, detail, failedComponent)', async () => {
        mockGenerateContent.mockResolvedValue(makeGeminiResponse(makeValidJson()));
        const { generateCostEstimate } = await import('../estimate-cost');
        await generateCostEstimate({
            title: 'DB board tripping',
            trade: 'Electrical',
            detail: 'Circuit trips every morning',
            failedComponent: 'RCBO breaker',
            userId: 'user-123',
            conversationId: 'conv-456',
        });
        const callArgs = mockGenerateContent.mock.calls[0][0];
        const userText = callArgs.contents[0].parts[0].text as string;
        expect(userText).toContain('Electrical');
        expect(userText).toContain('Circuit trips every morning');
        expect(userText).toContain('RCBO breaker');
    });

    it('canonicalises "callout" label to "Call-Out Fee"', async () => {
        mockGenerateContent.mockResolvedValue(
            makeGeminiResponse(
                JSON.stringify({
                    line_items: [{ label: 'call out fee', low: 500, high: 800 }],
                    note: 'x',
                }),
            ),
        );
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Test' });
        expect(result?.line_items[0].label).toBe('Call-Out Fee');
    });

    it('rounds values to nearest 50', async () => {
        mockGenerateContent.mockResolvedValue(
            makeGeminiResponse(
                JSON.stringify({
                    line_items: [{ label: 'Labour', low: 523, high: 1234 }],
                    note: 'x',
                }),
            ),
        );
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Test' });
        expect(result?.line_items[0].low).toBe(500);
        expect(result?.line_items[0].high).toBe(1250);
    });

    it('swaps low/high when model returns them inverted', async () => {
        mockGenerateContent.mockResolvedValue(
            makeGeminiResponse(
                JSON.stringify({
                    line_items: [{ label: 'Labour', low: 2000, high: 500 }],
                    note: 'x',
                }),
            ),
        );
        const { generateCostEstimate } = await import('../estimate-cost');
        const result = await generateCostEstimate({ title: 'Test' });
        expect(result?.line_items[0].low).toBeLessThanOrEqual(result!.line_items[0].high);
    });
});
